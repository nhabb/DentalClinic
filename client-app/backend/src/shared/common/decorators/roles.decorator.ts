import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Platform-level gate: `@Roles('superadmin')` on routes only the operator may call.
 * Clinic staff are authorized by permissions instead (see shared/authorization).
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
