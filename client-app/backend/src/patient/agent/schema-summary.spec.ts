import { formatSchema, type ColumnRow } from './schema-summary';

const row = (
  table: string,
  column: string,
  overrides: Partial<ColumnRow> = {},
): ColumnRow => ({
  table_name: table,
  table_comment: null,
  column_name: column,
  data_type: 'text',
  column_comment: null,
  ...overrides,
});

describe('formatSchema', () => {
  it('prints each table with its columns indented beneath it', () => {
    const text = formatSchema([
      row('branches', 'id', { data_type: 'bigint' }),
      row('branches', 'name'),
    ]);
    expect(text).toBe('  branches\n    id (bigint)\n    name (text)');
  });

  it('appends the table and column comments when present', () => {
    const text = formatSchema([
      row('appointments', 'status', {
        table_comment: "A patient's visit with a doctor.",
        column_comment:
          'scheduled | confirmed | completed | cancelled | no_show.',
      }),
    ]);
    expect(text).toBe(
      "  appointments: A patient's visit with a doctor.\n" +
        '    status (text): scheduled | confirmed | completed | cancelled | no_show.',
    );
  });

  it('keeps the table comment from the first row even if later rows lack it', () => {
    const text = formatSchema([
      row('t', 'a', { table_comment: 'About t' }),
      row('t', 'b'),
    ]);
    expect(text).toContain('  t: About t');
    expect(text).toContain('    b (text)');
  });

  it('leaves out credential columns entirely', () => {
    const text = formatSchema([
      row('users', 'email'),
      row('users', 'password_hash', { column_comment: 'bcrypt hash' }),
      row('users', 'password_setup_token_hash'),
    ]);
    expect(text).toContain('email');
    expect(text).not.toContain('password');
    expect(text).not.toContain('bcrypt');
  });

  it('is empty for no rows', () => {
    expect(formatSchema([])).toBe('');
  });
});
