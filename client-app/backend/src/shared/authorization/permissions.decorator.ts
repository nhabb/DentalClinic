import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Declares the permission(s) a staff route needs. Handler metadata overrides
 * class metadata, so a controller can default to `x:read` and mark its writes
 * with `x:write`. Platform superadmins always pass; patients never do (their
 * routes use ownership checks instead, see AccessControlService).
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
