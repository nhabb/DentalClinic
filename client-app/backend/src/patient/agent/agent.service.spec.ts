import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { AgentService } from './agent.service';

/**
 * The OpenAI client is stubbed: each test scripts what the model "says",
 * then checks which tools it was offered and which tool calls actually ran.
 */
interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface Completion {
  choices: {
    finish_reason: 'tool_calls' | 'stop';
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
  }[];
}

interface CreateParams {
  tools: { function: { name: string } }[];
  messages: { role: string; content: string | null; tool_call_id?: string }[];
}

type CreateMock = jest.Mock<Promise<Completion>, [CreateParams]>;

function toolCallTurn(name: string, args: string): Completion {
  return {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name, arguments: args },
            },
          ],
        },
      },
    ],
  };
}

const finalTurn = (content: string): Completion => ({
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }],
});

function userWith(role: string, permissions: string[]): RequestUser {
  return {
    id: '7',
    role,
    organization_id: '1',
    branch_id: '1',
    branch_scope_id: null,
    permissions,
  };
}

function build(turns: Completion[]) {
  const create: CreateMock = jest.fn<Promise<Completion>, [CreateParams]>();
  for (const turn of turns) create.mockResolvedValueOnce(turn);

  const billing = { findAll: jest.fn().mockResolvedValue({ data: [] }) };
  const roles = { list: jest.fn().mockResolvedValue([{ key: 'doctor' }]) };
  const users = {
    findById: jest
      .fn()
      .mockResolvedValue({ first_name: 'Dana', last_name: 'H' }),
  };
  // The guarded SELECT snapshots session settings around the query.
  const $queryRawUnsafe = jest.fn((sql: string) =>
    Promise.resolve(
      sql.startsWith('SELECT current_setting') ? [{ s0: '1' }] : [{ n: 3 }],
    ),
  );
  const $executeRawUnsafe = jest.fn(() => Promise.resolve(0));
  const prisma = {
    $queryRawUnsafe,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRawUnsafe, $executeRawUnsafe }),
  };

  const service = new AgentService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    users as never,
    {} as never,
    {} as never,
    billing as never,
    roles as never,
    prisma as never,
  );
  // Replace the lazily created client with the scripted stub.
  (service as unknown as { openai: unknown }).openai = {
    chat: { completions: { create } },
  };

  const paramsOf = (call: number): CreateParams => create.mock.calls[call][0];
  const lastToolResult = (
    call: number,
  ): { error?: string; [k: string]: unknown } =>
    JSON.parse(paramsOf(call).messages.at(-1)?.content ?? '{}') as {
      error?: string;
    };

  return { service, billing, roles, prisma, paramsOf, lastToolResult };
}

const secretary = userWith('secretary', [
  'agent:use',
  'appointments:read',
  'billing:read',
]);

describe('AgentService.chat', () => {
  it('offers the model only the tools the user may use', async () => {
    const { service, paramsOf } = build([finalTurn('hi')]);
    await service.chat([{ role: 'user', content: 'hello' }], secretary);

    const offered = paramsOf(0).tools.map((t) => t.function.name);
    expect(offered).toContain('list_invoices');
    expect(offered).toContain('get_my_permissions');
    expect(offered).not.toContain('create_invoice');
    expect(offered).not.toContain('list_roles');
  });

  it('puts the user’s permissions into the system prompt', async () => {
    const { service, paramsOf } = build([finalTurn('hi')]);
    await service.chat([], secretary);

    const system = paramsOf(0).messages[0].content ?? '';
    expect(system).toContain('role "secretary"');
    expect(system).toContain('- billing:read: View invoices');
    expect(system).toContain('Name: Dana H | Role: secretary | ID: 7');
  });

  it('runs an allowed tool call and feeds the result back', async () => {
    const { service, billing, paramsOf } = build([
      toolCallTurn('list_invoices', '{"status":"open"}'),
      finalTurn('No open invoices.'),
    ]);
    const reply = await service.chat([], secretary);

    expect(billing.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open' }),
    );
    expect(paramsOf(1).messages.at(-1)).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_1',
    });
    expect(reply).toBe('No open invoices.');
  });

  it('refuses a tool the model names without permission and never runs it', async () => {
    const { service, roles, lastToolResult } = build([
      toolCallTurn('list_roles', '{}'),
      finalTurn('You cannot view roles.'),
    ]);
    await service.chat([], secretary);

    expect(roles.list).not.toHaveBeenCalled();
    expect(lastToolResult(1).error).toMatch(
      /lacks the permission: roles:manage/,
    );
  });

  it('refuses SQL over tables outside the user’s permissions', async () => {
    const { service, prisma, lastToolResult } = build([
      toolCallTurn(
        'query_database',
        '{"sql":"SELECT sum(amount) FROM expenses"}',
      ),
      finalTurn('…'),
    ]);
    await service.chat([], secretary);

    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(lastToolResult(1).error).toMatch(
      /lacks the permission: expenses:read/,
    );
  });

  it('runs SQL over permitted tables on the tenant connection', async () => {
    const { service, prisma } = build([
      toolCallTurn(
        'query_database',
        '{"sql":"SELECT count(*) AS n FROM appointments"}',
      ),
      finalTurn('3 appointments.'),
    ]);
    const reply = await service.chat([], secretary);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('(SELECT count(*) AS n FROM appointments)'),
    );
    expect(reply).toBe('3 appointments.');
  });

  it('answers get_my_permissions from the request user, without the database', async () => {
    const { service, lastToolResult } = build([
      toolCallTurn('get_my_permissions', '{}'),
      finalTurn('…'),
    ]);
    await service.chat([], secretary);

    const result = lastToolResult(1) as {
      role: string;
      granted: { key: string }[];
      denied: { key: string }[];
    };
    expect(result.role).toBe('secretary');
    expect(result.granted.map((p) => p.key)).toContain('billing:read');
    expect(result.denied.map((p) => p.key)).toContain('billing:write');
  });

  it('survives malformed tool arguments', async () => {
    const { service, lastToolResult } = build([
      toolCallTurn('query_database', '{not json'),
      finalTurn('…'),
    ]);
    await service.chat([], secretary);

    expect(lastToolResult(1).error).toMatch(/Only SELECT/);
  });

  it('turns a wrongly typed id into a readable error for the model', async () => {
    const { service, lastToolResult } = build([
      toolCallTurn('get_invoice', '{"id":"abc"}'),
      finalTurn('…'),
    ]);
    await service.chat([], secretary);

    expect(lastToolResult(1).error).toMatch(/"id" must be a whole-number id/);
  });
});
