import * as jwt from 'jsonwebtoken';

/**
 * Claims this backend puts in the JWTs it issues (see AuthService.sign).
 * Shared by the auth guard and the tenant middleware so both read the token the same way.
 */
export interface AppJwtPayload {
  /** users.id as a string */
  sub: string;
  email?: string | null;
  role?: string;
  /** organizations.id as a string; null for platform superadmins. Absent on tokens issued before multi-tenancy. */
  org_id?: string | null;
  /** branches.id as a string, or null when the user works across all branches. */
  branch_id?: string | null;
}

export function jwtSecret(): string {
  return process.env.JWT_SECRET || 'changeme';
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization || !authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Verified claims, or null when the token is missing, malformed, expired or forged. */
export function verifyAppJwt(token: string | null): AppJwtPayload | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret());
    return typeof decoded === 'object' && decoded !== null
      ? (decoded as AppJwtPayload)
      : null;
  } catch {
    return null;
  }
}
