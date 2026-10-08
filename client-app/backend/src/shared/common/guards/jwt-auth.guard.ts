import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { bearerToken, verifyAppJwt } from '../app-jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { currentTenant } from '../../tenant/tenant-context';

/** What controllers see as `request.user` after this guard. */
export interface RequestUser {
  /** users.id as a string */
  id: string;
  role: string;
  /** organizations.id as a string; null for platform superadmins. */
  organization_id: string | null;
  /** Home branch (branches.id as a string) or null. */
  branch_id: string | null;
  /** Branch the user is confined to, or null for all branches. */
  branch_scope_id: string | null;
  /** Permission keys of the user's role (see src/shared/authorization/permissions.ts). */
  permissions: string[];
}

/**
 * Layer 1 of API protection, registered globally (see AppModule): every route
 * needs a valid bearer token unless it is marked @Public().
 *
 * The token proves identity. Whether the account may still act (active user,
 * active clinic, current role/branch) comes from the TenantContext that the
 * middleware built from the database, so revoking access does not depend on
 * the token expiring.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: RequestUser;
    }>();
    const token = bearerToken(request.headers['authorization']);

    if (isPublic) {
      // Public routes still learn who is calling when a valid, active token is present.
      if (
        token &&
        verifyAppJwt(token) &&
        currentTenant().accountStatus === 'active'
      ) {
        request.user = userFromContext();
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }
    if (!verifyAppJwt(token)) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    switch (currentTenant().accountStatus) {
      case 'active':
        break;
      case 'inactive':
        throw new UnauthorizedException('This account is disabled');
      case 'organization_inactive':
        throw new ForbiddenException('This clinic is deactivated');
      default:
        throw new UnauthorizedException('Unknown account');
    }

    request.user = userFromContext();
    return true;
  }
}

/** `request.user` as derived from the request's tenant context. */
export function userFromContext(): RequestUser {
  const tenant = currentTenant();
  return {
    id: tenant.userId?.toString() ?? '',
    role: tenant.role ?? '',
    organization_id: tenant.organizationId?.toString() ?? null,
    branch_id: tenant.homeBranchId?.toString() ?? null,
    branch_scope_id: tenant.branchScopeId?.toString() ?? null,
    permissions: [...tenant.permissions],
  };
}
