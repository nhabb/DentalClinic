import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { buildSystemPrompt } from './agent-prompt';

const doctor: RequestUser = {
  id: '12',
  role: 'doctor',
  organization_id: '1',
  branch_id: '1',
  branch_scope_id: null,
  permissions: ['agent:use', 'appointments:read', 'billing:read'],
};

const prompt = (
  overrides: Partial<Parameters<typeof buildSystemPrompt>[0]> = {},
) =>
  buildSystemPrompt({
    user: doctor,
    displayName: 'Dana Haddad',
    today: '2026-10-08',
    dbSchema: '  appointments: id (bigint)',
    ...overrides,
  });

describe('buildSystemPrompt', () => {
  it('states who the user is and their id for "my" filters', () => {
    const text = prompt();
    expect(text).toContain('Name: Dana Haddad | Role: doctor | ID: 12');
    expect(text).toContain('doctor_id: 12');
  });

  it('falls back to an unknown name without inventing one', () => {
    expect(prompt({ displayName: null })).toContain(
      'Name: unknown | Role: doctor | ID: 12',
    );
  });

  it('lists granted and denied permissions with labels', () => {
    const text = prompt();
    const allowed = text.slice(
      text.indexOf('Allowed:'),
      text.indexOf('Not allowed:'),
    );
    const notAllowed = text.slice(
      text.indexOf('Not allowed:'),
      text.indexOf('Permission rules:'),
    );
    expect(allowed).toContain('- billing:read: View invoices');
    expect(allowed).not.toContain('billing:write');
    expect(notAllowed).toContain('- billing:write: Create invoices');
    expect(notAllowed).toContain('- roles:manage: Edit roles and permissions');
  });

  it('tells the model not to work around missing permissions', () => {
    expect(prompt()).toMatch(/Do not try another tool or query_database/);
  });

  it('includes the schema and today’s date', () => {
    const text = prompt();
    expect(text).toContain('appointments: id (bigint)');
    expect(text).toContain("Today's date is 2026-10-08");
  });
});
