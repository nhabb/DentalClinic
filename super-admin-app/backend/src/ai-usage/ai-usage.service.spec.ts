import { AiUsageService, estimateCostUsd } from './ai-usage.service';

const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);

/** Two clinics; only the first used the assistant, with two accounts and two models. */
function build() {
  const prisma = {
    organizations: {
      findMany: jest.fn().mockResolvedValue([
        { id: 1n, name: 'BrightSmile', slug: 'brightsmile', is_active: true },
        { id: 2n, name: 'Quiet Clinic', slug: 'quiet', is_active: true },
      ]),
      findUnique: jest.fn().mockResolvedValue({ id: 1n, name: 'BrightSmile', slug: 'brightsmile', is_active: true }),
    },
    agent_usage: {
      groupBy: jest.fn().mockImplementation(({ by }: { by: string[] }) => {
        if (by.includes('model') && by.includes('organization_id')) {
          return Promise.resolve([
            {
              organization_id: 1n,
              model: 'gpt-4o-mini',
              _count: { _all: 3 },
              _sum: { prompt_tokens: 30_000, completion_tokens: 1_000 },
              _max: { created_at: day(1) },
            },
            {
              organization_id: 1n,
              model: 'gpt-4o',
              _count: { _all: 1 },
              _sum: { prompt_tokens: 10_000, completion_tokens: 500 },
              _max: { created_at: day(3) },
            },
          ]);
        }
        if (by.includes('user_id') && by.includes('organization_id')) {
          return Promise.resolve([
            { organization_id: 1n, user_id: 7n },
            { organization_id: 1n, user_id: 8n },
          ]);
        }
        // per-account detail: by user_id, model
        return Promise.resolve([
          {
            user_id: 7n,
            model: 'gpt-4o-mini',
            _count: { _all: 3 },
            _sum: { prompt_tokens: 30_000, completion_tokens: 1_000, rounds: 5, tool_calls: 2 },
            _max: { created_at: day(1) },
          },
          {
            user_id: 8n,
            model: 'gpt-4o',
            _count: { _all: 1 },
            _sum: { prompt_tokens: 10_000, completion_tokens: 500, rounds: 1, tool_calls: 0 },
            _max: { created_at: day(3) },
          },
        ]);
      }),
    },
    users: {
      groupBy: jest.fn().mockImplementation(({ where }: { where?: unknown }) =>
        Promise.resolve(
          where
            ? [{ organization_id: 1n, _count: { _all: 2 } }, { organization_id: 2n, _count: { _all: 1 } }]
            : [{ organization_id: 1n, _count: { _all: 5 } }, { organization_id: 2n, _count: { _all: 3 } }],
        ),
      ),
      findMany: jest.fn().mockResolvedValue([
        { id: 7n, first_name: 'Dana', last_name: 'H', email: 'dana@x.com', role: 'doctor', is_active: true },
        { id: 8n, first_name: 'Sam', last_name: 'K', email: 'sam@x.com', role: 'admin', is_active: true },
      ]),
    },
  };
  return { service: new AiUsageService(prisma as never), prisma };
}

describe('estimateCostUsd', () => {
  it('prices by model and falls back to the default for unknown ones', () => {
    expect(estimateCostUsd('gpt-4o-mini', 1_000_000, 1_000_000)).toBeCloseTo(0.75);
    expect(estimateCostUsd('gpt-4o', 1_000_000, 0)).toBeCloseTo(2.5);
    expect(estimateCostUsd('something-new', 1_000_000, 0)).toBeCloseTo(0.15);
  });
});

describe('AiUsageService.overview', () => {
  it('sums tokens and cost per clinic across models, counts accounts, and lists quiet clinics too', async () => {
    const { service } = build();
    const result = await service.overview(30);

    expect(result.days).toBe(30);
    expect(result.clinics.map((c) => c.organization.name)).toEqual(['BrightSmile', 'Quiet Clinic']);

    const bright = result.clinics[0];
    expect(bright.questions).toBe(4);
    expect(bright.prompt_tokens).toBe(40_000);
    expect(bright.completion_tokens).toBe(1_500);
    // mini: 30k*0.15/M + 1k*0.6/M = 0.0045 + 0.0006; 4o: 10k*2.5/M + 500*10/M = 0.025 + 0.005
    expect(bright.estimated_cost_usd).toBeCloseTo(0.0351, 4);
    expect(bright.accounts).toEqual({ total: 5, staff: 2, ai_users: 2 });
    expect(bright.last_used_at?.getTime()).toBeGreaterThan(day(2).getTime());

    const quiet = result.clinics[1];
    expect(quiet.questions).toBe(0);
    expect(quiet.accounts).toEqual({ total: 3, staff: 1, ai_users: 0 });
    expect(quiet.last_used_at).toBeNull();

    expect(result.totals.questions).toBe(4);
    expect(result.totals.clinics_using).toBe(1);
    expect(result.totals.accounts_using).toBe(2);
  });
});

describe('AiUsageService.clinic', () => {
  it('breaks one clinic down per account, busiest first', async () => {
    const { service } = build();
    const result = await service.clinic(1n, 7);

    expect(result.organization.name).toBe('BrightSmile');
    expect(result.accounts.map((a) => a.user.first_name)).toEqual(['Dana', 'Sam']);
    expect(result.accounts[0]).toMatchObject({
      questions: 3,
      prompt_tokens: 30_000,
      completion_tokens: 1_000,
      rounds: 5,
      tool_calls: 2,
    });
    expect(result.accounts[0].estimated_cost_usd).toBeCloseTo(0.0051, 4);
    expect(result.totals.accounts_using).toBe(2);
    expect(result.totals.estimated_cost_usd).toBeCloseTo(0.0351, 4);
  });

  it('404s for an unknown clinic', async () => {
    const { service, prisma } = build();
    prisma.organizations.findUnique.mockResolvedValueOnce(null);
    await expect(service.clinic(99n, 7)).rejects.toThrow(/not found/);
  });
});

describe('AiUsageService.account', () => {
  it('lists each question with its own cost and never any text', async () => {
    const { service, prisma } = build();
    (prisma.users as { findUnique?: jest.Mock }).findUnique = jest.fn().mockResolvedValue({
      id: 7n,
      first_name: 'Dana',
      last_name: 'H',
      email: 'dana@x.com',
      role: 'doctor',
      is_active: true,
      organization: { id: 1n, name: 'BrightSmile', slug: 'brightsmile', is_active: true },
    });
    (prisma.agent_usage as { findMany?: jest.Mock }).findMany = jest.fn().mockResolvedValue([
      { id: 2n, created_at: day(1), model: 'gpt-4o-mini', prompt_tokens: 20_000, completion_tokens: 500, rounds: 3, tool_calls: 2, duration_ms: 4200 },
      { id: 1n, created_at: day(2), model: 'gpt-4o-mini', prompt_tokens: 10_000, completion_tokens: 500, rounds: 1, tool_calls: 0, duration_ms: 900 },
    ]);
    const result = await service.account(7n, 30);
    expect(result.user.organization.name).toBe('BrightSmile');
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toMatchObject({ id: '2', rounds: 3, tool_calls: 2, duration_ms: 4200 });
    expect(result.questions[0].estimated_cost_usd).toBeCloseTo(0.0033, 4);
    expect(result.totals).toMatchObject({ questions: 2, prompt_tokens: 30_000, completion_tokens: 1_000 });
    expect(JSON.stringify(result)).not.toMatch(/content|question_text/);
  });
});
