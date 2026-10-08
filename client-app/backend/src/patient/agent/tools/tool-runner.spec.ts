import type { RequestUser } from '../../../shared/common/guards/jwt-auth.guard';
import { AGENT_TOOLS } from '../agent.tools';
import { TOOL_PERMISSIONS } from '../agent-access';
import { ToolArgs } from '../tool-args';
import { ToolRunner } from './tool-runner';

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

function build() {
  const billing = {
    findOne: jest.fn().mockResolvedValue({ id: 42n, total_amount: '10' }),
    getKpis: jest.fn().mockRejectedValue(new Error('kpis exploded')),
  };
  const roles = { list: jest.fn().mockResolvedValue([{ key: 'doctor' }]) };
  const runner = new ToolRunner(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    billing as never,
    roles as never,
    {} as never,
  );
  return { runner, billing, roles };
}

const secretary = userWith('secretary', ['agent:use', 'billing:read']);

const errorOf = (out: string): string | undefined =>
  (JSON.parse(out) as { error?: string }).error;

describe('ToolRunner: coverage', () => {
  it('has exactly one handler per tool definition, and no handler without a definition', () => {
    const { runner } = build();
    const defined = AGENT_TOOLS.map((t) => t.function.name).sort();
    expect(runner.toolNames().sort()).toEqual(defined);
    expect(Object.keys(TOOL_PERMISSIONS).sort()).toEqual(defined);
  });
});

describe('ToolRunner.run', () => {
  it('runs an allowed tool and serializes BigInt ids for the model', async () => {
    const { runner, billing } = build();
    const out = await runner.run(
      secretary,
      'get_invoice',
      new ToolArgs({ id: 42 }),
    );
    expect(billing.findOne).toHaveBeenCalledWith(42n);
    expect(JSON.parse(out)).toEqual({ id: 42, total_amount: '10' });
  });

  it('refuses a tool the role lacks the permission for, without calling it', async () => {
    const { runner, roles } = build();
    const out = await runner.run(secretary, 'list_roles', new ToolArgs({}));
    expect(roles.list).not.toHaveBeenCalled();
    expect(errorOf(out)).toMatch(/lacks the permission: roles:manage/);
  });

  it('refuses a tool name that does not exist', async () => {
    const { runner } = build();
    const out = await runner.run(
      secretary,
      'drop_everything',
      new ToolArgs({}),
    );
    expect(errorOf(out)).toMatch(/Unknown tool/);
  });

  it('turns a bad argument into a readable error for the model', async () => {
    const { runner } = build();
    const out = await runner.run(
      secretary,
      'get_invoice',
      new ToolArgs({ id: 'abc' }),
    );
    expect(errorOf(out)).toMatch(/"id" must be a whole-number id/);
  });

  it('turns a service failure into an error result instead of throwing', async () => {
    const { runner } = build();
    const out = await runner.run(
      secretary,
      'get_financial_kpis',
      new ToolArgs({}),
    );
    expect(JSON.parse(out)).toEqual({ error: 'kpis exploded' });
  });
});
