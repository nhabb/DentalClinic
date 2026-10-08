import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';

/**
 * One-time "set your password" links, compatible with the clinic backend's
 * AccountSetupService: only a sha256 of the token is stored on the user row and
 * the clinic app's /set-password page redeems it. New clinic owners therefore
 * finish onboarding inside their own clinic app.
 */
export interface PasswordSetup {
  /** Store on users.password_setup_token_hash */
  tokenHash: string;
  /** Store on users.password_setup_expires_at */
  expiresAt: Date;
  /** Give to the person (never stored). */
  link: string;
}

export function newPasswordSetup(now = new Date()): PasswordSetup {
  const ttlHours = Number(process.env.PASSWORD_SETUP_TTL_HOURS ?? 72);
  const token = randomBytes(32).toString('base64url');
  const base = (process.env.CLINIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return {
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000),
    link: `${base}/set-password?token=${encodeURIComponent(token)}`,
  };
}

/** An unusable placeholder hash for accounts that must set their password first. */
export function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(24).toString('hex'), 10);
}
