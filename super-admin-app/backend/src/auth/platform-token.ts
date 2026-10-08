import * as jwt from 'jsonwebtoken';

/** Claims of a platform console token. Distinct audience from clinic tokens. */
export interface PlatformTokenPayload {
  /** users.id as a string */
  sub: string;
  email: string | null;
  aud: 'platform';
}

const AUDIENCE = 'platform';

export function platformSecret(): string {
  const secret = process.env.PLATFORM_JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('PLATFORM_JWT_SECRET must be set to a long random string');
  }
  return secret;
}

export function signPlatformToken(user: { id: bigint; email: string | null }): string {
  const payload: Omit<PlatformTokenPayload, 'aud'> = { sub: user.id.toString(), email: user.email };
  return jwt.sign(payload, platformSecret(), { audience: AUDIENCE, expiresIn: '12h' });
}

/** Verified claims, or null for a missing, forged, expired or clinic token. */
export function verifyPlatformToken(token: string | null): PlatformTokenPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, platformSecret(), { audience: AUDIENCE });
    return typeof decoded === 'object' && decoded !== null ? (decoded as PlatformTokenPayload) : null;
  } catch {
    return null;
  }
}

export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : null;
}
