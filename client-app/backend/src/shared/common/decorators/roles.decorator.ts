import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Roles allowed to call a route. Use together with RolesGuard (after JwtAuthGuard). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** Roles that administer an organization (all its branches). */
export const ORG_ADMIN_ROLES = ['admin', 'superadmin'];
/** Every staff role. */
export const STAFF_ROLES = ['doctor', 'secretary', 'admin', 'superadmin'];
