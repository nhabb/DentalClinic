import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsPhone, isPhoneNumber, phoneDigits } from './phone';

class Dto {
  @IsPhone()
  phone?: string;
}

/** Validate a body the way the global ValidationPipe does. */
function check(phone: unknown): { ok: boolean; value?: string } {
  const dto = plainToInstance(Dto, { phone });
  const errors = validateSync(dto);
  return { ok: errors.length === 0, value: dto.phone };
}

describe('phone numbers', () => {
  it.each([
    '+961 70 123 456',
    '03 123 456',
    '+33 6 12 34 56 78',
    '(961) 70-123456',
    '70123456',
    '+9613123456',
    '01.123.456',
  ])('accepts %s', (value) => {
    expect(check(value).ok).toBe(true);
  });

  it.each([
    ['letters only', 'abcdef'],
    ['a word', 'phone'],
    ['digits with a letter', '70 123 45a'],
    ['too short', '12345'],
    ['too long', '1'.repeat(21)],
    ['a note instead of a number', 'call the son'],
    ['an email', 'patient@example.com'],
    ['symbols only', '++++++'],
  ])('refuses %s', (_label, value) => {
    expect(check(value).ok).toBe(false);
  });

  it('treats a blank field as not given, so clearing a form is allowed', () => {
    expect(check('').ok).toBe(true);
    expect(check('   ').ok).toBe(true);
    expect(check(undefined).ok).toBe(true);
    expect(check('').value).toBeUndefined();
  });

  it('keeps what the clinic typed, only trimming it', () => {
    expect(check('  +961 70 123 456  ').value).toBe('+961 70 123 456');
  });

  it('reads the digits of a number for callers that need them', () => {
    expect(phoneDigits('+961 (70) 123-456')).toBe('96170123456');
  });

  it('exposes the same rule to non-DTO callers', () => {
    expect(isPhoneNumber('+961 70 123 456')).toBe(true);
    expect(isPhoneNumber('abcdef')).toBe(false);
    expect(isPhoneNumber(70123456)).toBe(false);
  });
});
