import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AppJwtPayload, bearerToken, verifyAppJwt } from '../common/app-jwt';
import { ALL_PERMISSIONS } from '../authorization/permissions';
import { TenantResolverService } from './tenant-resolver.service';
import { UserAccessService } from './user-access.service';
import {
  EMPTY_TENANT,
  TenantContext,
  tenantStorage,
  toBigIntOrNull,
} from './tenant-context';

const PLATFORM_ROLE = 'superadmin';
/** Host labels that never identify a tenant. */
const IGNORED_SUBDOMAINS = new Set(['www', 'api', 'app', 'admin', 'localhost']);

/**
 * Establishes the TenantContext for the whole request before any guard,
 * controller or service runs.
 *
 *   - With a valid bearer token: the token proves who the user is; the tenant,
 *     role, branch and account status come from the database (cached briefly by
 *     UserAccessService). Superadmins run with RLS bypassed and may scope
 *     themselves to one tenant via X-Organization-Id.
 *   - Without a token (signup, login, public doctor list): tenant from the
 *     X-Organization (slug) / X-Organization-Id header, else the host's first
 *     subdomain, else DEFAULT_ORGANIZATION_SLUG. Nothing resolved = no tenant =
 *     every table reads as empty.
 *
 * Registered with app.use() in main.ts so it also covers routes without guards.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(
    private readonly resolver: TenantResolverService,
    private readonly userAccess: UserAccessService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    let ctx: TenantContext;
    try {
      ctx = await this.buildContext(req);
    } catch (err) {
      this.logger.warn(
        `Could not resolve tenant for ${req.method} ${req.originalUrl}: ${(err as Error).message}`,
      );
      ctx = { ...EMPTY_TENANT };
    }
    tenantStorage.run(ctx, () => next());
  }

  /** Exposed for tests; the context a request would get. */
  async buildContext(req: Request): Promise<TenantContext> {
    // An invalid or expired token is treated as anonymous here; the auth guard rejects it.
    const payload = verifyAppJwt(bearerToken(req.headers.authorization));
    if (payload) return this.fromToken(payload, req);
    return this.fromAnonymousRequest(req);
  }

  private async fromToken(
    payload: AppJwtPayload,
    req: Request,
  ): Promise<TenantContext> {
    const userId = toBigIntOrNull(payload.sub);
    const access = userId === null ? null : await this.userAccess.load(userId);

    if (!access) {
      // Token for an account that no longer exists: no tenant, guard will reject.
      return {
        ...EMPTY_TENANT,
        userId,
        accountStatus: 'unknown',
        source: 'jwt',
      };
    }

    const accountStatus = !access.isActive
      ? 'inactive'
      : !access.organizationActive
        ? 'organization_inactive'
        : 'active';

    const isPlatformAdmin =
      access.role === PLATFORM_ROLE && access.organizationId === null;
    if (isPlatformAdmin) {
      // Unscoped, a superadmin sees every tenant (RLS bypass). Naming a tenant via
      // X-Organization(-Id) makes them act exactly like a member of that tenant.
      const scoped = await this.organizationFromHeaders(req);
      return {
        organizationId: scoped,
        homeBranchId: null,
        branchScopeId: null,
        userId: access.userId,
        role: access.role,
        accountStatus,
        permissions: [...ALL_PERMISSIONS],
        system: scoped === null,
        source: 'jwt',
      };
    }

    return {
      organizationId: access.organizationId,
      homeBranchId: access.homeBranchId,
      branchScopeId: UserAccessService.branchScopeOf(access),
      userId: access.userId,
      role: access.role,
      accountStatus,
      permissions: access.permissions,
      system: false,
      source: 'jwt',
    };
  }

  private async fromAnonymousRequest(req: Request): Promise<TenantContext> {
    const fromHeaders = await this.organizationFromHeaders(req);
    if (fromHeaders !== null) {
      return { ...EMPTY_TENANT, organizationId: fromHeaders, source: 'header' };
    }

    const sub = this.subdomainOf(req);
    if (sub) {
      const id = await this.resolver.organizationIdBySlug(sub);
      if (id !== null)
        return { ...EMPTY_TENANT, organizationId: id, source: 'host' };
    }

    const fallback = await this.resolver.defaultOrganizationId();
    return {
      ...EMPTY_TENANT,
      organizationId: fallback,
      source: fallback === null ? 'none' : 'default',
    };
  }

  private async organizationFromHeaders(req: Request): Promise<bigint | null> {
    const idHeader = this.headerValue(req, 'x-organization-id');
    if (idHeader) {
      const id = toBigIntOrNull(idHeader);
      return id === null ? null : this.resolver.organizationIdById(id);
    }
    const slugHeader = this.headerValue(req, 'x-organization');
    if (slugHeader) return this.resolver.organizationIdBySlug(slugHeader);
    return null;
  }

  private headerValue(req: Request, name: string): string | null {
    const raw = req.headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value && value.trim() ? value.trim() : null;
  }

  /** First label of the Host header when it looks like a tenant subdomain. */
  private subdomainOf(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-host'];
    const host =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded) ??
      req.headers.host ??
      '';
    const hostname = host.split(',')[0].trim().split(':')[0].toLowerCase();
    if (!hostname || /^[\d.]+$/.test(hostname)) return null;
    const labels = hostname.split('.');
    if (labels.length < 3) return null;
    const first = labels[0];
    return IGNORED_SUBDOMAINS.has(first) ? null : first;
  }
}
