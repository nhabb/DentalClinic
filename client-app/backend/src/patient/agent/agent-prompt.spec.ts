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

  it('tells the model that missing permission is not missing data', () => {
    expect(prompt()).toContain(
      'A missing permission means you cannot see that data, not that it does not exist.',
    );
  });

  it('gives financial guidance to a user with billing:read', () => {
    const text = prompt();
    expect(text).toContain('Financial guidelines:');
    expect(text).toContain('Use list_invoices and get_invoice');
    expect(text).not.toContain('this user lacks billing:read');
  });

  it('replaces financial guidance with a hard stop without billing:read', () => {
    const text = prompt({
      user: {
        ...doctor,
        permissions: ['agent:use', 'records:read', 'lab:read'],
      },
    });
    expect(text).toContain(
      'Financial questions (this user lacks billing:read)',
    );
    expect(text).toContain(
      'Never say a patient has no payments or no invoices',
    );
    expect(text).toContain('are not patient payments');
    expect(text).not.toContain('Financial guidelines:');
    expect(text).not.toContain('Use list_invoices and get_invoice');
  });

  it('defines the three work statuses and forbids invented ones', () => {
    const text = prompt();
    expect(text).toContain('Clinical records vocabulary');
    expect(text).toContain(
      'exactly three statuses: completed (done), planned (proposed, not done yet), missing (the tooth is absent)',
    );
    expect(text).toContain(
      'There is no "scheduled", "pending" or "in progress" work status.',
    );
  });

  it('maps every record_type the app writes to its meaning', () => {
    const text = prompt();
    expect(text).toContain('"treatment" = completed work');
    expect(text).toContain('"treatment_plan" = planned work');
    expect(text).toContain('"missing_tooth" = missing tooth');
    expect(text).toContain('"general_note" = a free-text note');
  });

  it('keeps scheduling with appointments and dates off the work status', () => {
    const text = prompt();
    expect(text).toContain('"Scheduled" belongs to appointments only');
    expect(text).toContain(
      'planned work stays "planned" until it is recorded as completed, whatever its date',
    );
    expect(text).toContain('patient_records.appointment_id, not at the date');
  });

  it('shows the vocabulary to every user, with or without billing', () => {
    const noBilling = prompt({
      user: { ...doctor, permissions: ['agent:use', 'records:read'] },
    });
    expect(noBilling).toContain('Clinical records vocabulary');
    expect(noBilling).toContain('it is not a payment and not an invoice');
  });

  it('a superadmin keeps the financial guidance without an explicit grant', () => {
    const text = prompt({
      user: { ...doctor, role: 'superadmin', permissions: ['agent:use'] },
    });
    expect(text).toContain('Financial guidelines:');
  });

  it('includes the schema and today’s date', () => {
    const text = prompt();
    expect(text).toContain('appointments: id (bigint)');
    expect(text).toContain("Today's date is 2026-10-08");
  });
});
