import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * One definition of what a phone number is, for every number the clinic
 * stores: patients, emergency contacts, staff, labs, outside doctors,
 * branches and the organization itself.
 *
 * Deliberately permissive about shape and strict about content: digits, and
 * the punctuation people actually type (+, spaces, -, (), .), with 6 to 20
 * digits in it. That accepts "+961 70 123 456", "03 123 456" and a foreign
 * number, and refuses text like "abcdef" or "call the son", which used to be
 * stored happily because the field was only @IsString().
 *
 * Numbers are not normalized on the way in: what the clinic typed is what it
 * sees. Anything that needs a canonical form (WhatsApp sending) should
 * normalize at the point of use, not here.
 */

/** Digits, spaces and + - ( ) . only, with an optional leading +. */
const PHONE_SHAPE = /^\+?[\d\s().-]+$/;

/** At least this many digits to be a real number, and at most this many. */
const MIN_DIGITS = 6;
const MAX_DIGITS = 20;

export const PHONE_MESSAGE =
  'must be a phone number: digits with optional + ( ) - and spaces, 6 to 20 digits';

/** The digits of a typed number, ignoring punctuation and spacing. */
export const phoneDigits = (value: string): string => value.replace(/\D/g, '');

/** True when this is a storable phone number. Exported for the specs. */
export function isPhoneNumber(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!PHONE_SHAPE.test(trimmed)) return false;
  const digits = phoneDigits(trimmed).length;
  return digits >= MIN_DIGITS && digits <= MAX_DIGITS;
}

/**
 * An optional phone field on a DTO. Blank is treated as "not given" so a
 * cleared form field does not fail validation; the value is trimmed.
 */
export function IsPhone(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }): unknown => {
      // A non-string is left alone for @IsString to refuse with its own message.
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    }),
    IsString(),
    MaxLength(30),
    Matches(PHONE_SHAPE, { message: `$property ${PHONE_MESSAGE}` }),
    Matches(new RegExp(`^(?:\\D*\\d){${MIN_DIGITS},${MAX_DIGITS}}\\D*$`), {
      message: `$property ${PHONE_MESSAGE}`,
    }),
  );
}
