import * as jwt from 'jsonwebtoken';
import { Request } from 'express';
import { TenantContextMiddleware } from './tenant.middleware';
import { currentTenant, EMPTY_TENANT } from './tenant-context';
import { UserAccess } from './user-access.service';

const SECRET = 'test-secret';

function request(headers: Record<string, string> = {}): Request {
  return {
    headers,
    method: 'GET',
    originalUrl: '/api/test',
  } as unknown as Request;
}

const tokenFor = (userId: bigint) =>
  `Bearer ${jwt.sign({ sub: userId.toString() }, SECRET)}`;

const accessOf = (over: Partial<UserAccess> = {}): UserAccess => ({
  userId: 10n,
  organizationId: 5n,
  organizationActive: true,
  role: 'doctor',
  isActive: true,
  homeBranchId: 3n,
  restrictToBranch: false,
  ...over,
});

describe('TenantContextMiddleware', () => {
  let resolver: {
    organizationIdBySlug: jest.Mock;
    organizationIdById: jest.Mock;
    defaultOrganizationId: jest.Mock;
  };
  let userAccess: { load: jest.Mock };
  let middleware: TenantContextMiddleware;

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    resolver = {
      organizationIdBySlug: jest.fn(async (slug: string) =>
        slug === 'tyre-clinic' ? 2n : null,
      ),
      organizationIdById: jest.fn(async (id: bigint) =>
        id === 2n ? 2n : null,
      ),
      defaultOrganizationId: jest.fn(async () => 1n),
    };
    userAccess = { load: jest.fn(async () => accessOf()) };
    middleware = new TenantContextMiddleware(
      resolver as any,
      userAccess as any,
    );
  });

  describe('authenticated requests', () => {
    it('takes tenant, role and branches from the account record, not the token', async () => {
      const ctx = await middleware.buildContext(
        request({ authorization: tokenFor(10n) }),
      );
      expect(userAccess.load).toHaveBeenCalledWith(10n);
      expect(ctx).toEqual({
        organizationId: 5n,
        homeBranchId: 3n,
        branchScopeId: null,
        userId: 10n,
        role: 'doctor',
        accountStatus: 'active',
        system: false,
        source: 'jwt',
      });
    });

    it('confines restricted staff to their home branch', async () => {
      userAccess.load.mockResolvedValue(
        accessOf({ role: 'secretary', restrictToBranch: true }),
      );
      const ctx = await middleware.buildContext(
        request({ authorization: tokenFor(10n) }),
      );
      expect(ctx).toMatchObject({ homeBranchId: 3n, branchScopeId: 3n });
    });

    it('flags disabled accounts and deactivated clinics', async () => {
      userAccess.load.mockResolvedValueOnce(accessOf({ isActive: false }));
      expect(
        (
          await middleware.buildContext(
            request({ authorization: tokenFor(10n) }),
          )
        ).accountStatus,
      ).toBe('inactive');

      userAccess.load.mockResolvedValueOnce(
        accessOf({ organizationActive: false }),
      );
      expect(
        (
          await middleware.buildContext(
            request({ authorization: tokenFor(10n) }),
          )
        ).accountStatus,
      ).toBe('organization_inactive');
    });

    it('yields no tenant for tokens of deleted accounts', async () => {
      userAccess.load.mockResolvedValue(null);
      const ctx = await middleware.buildContext(
        request({ authorization: tokenFor(10n) }),
      );
      expect(ctx).toMatchObject({
        organizationId: null,
        userId: 10n,
        accountStatus: 'unknown',
        system: false,
      });
    });

    it('gives platform superadmins RLS bypass and no tenant', async () => {
      userAccess.load.mockResolvedValue(
        accessOf({
          role: 'superadmin',
          organizationId: null,
          homeBranchId: null,
        }),
      );
      const ctx = await middleware.buildContext(
        request({ authorization: tokenFor(10n) }),
      );
      expect(ctx).toMatchObject({
        organizationId: null,
        system: true,
        role: 'superadmin',
        accountStatus: 'active',
      });
    });

    it('lets a superadmin scope itself to one tenant with X-Organization-Id, dropping the bypass', async () => {
      userAccess.load.mockResolvedValue(
        accessOf({
          role: 'superadmin',
          organizationId: null,
          homeBranchId: null,
        }),
      );
      const ctx = await middleware.buildContext(
        request({ authorization: tokenFor(10n), 'x-organization-id': '2' }),
      );
      expect(ctx).toMatchObject({
        organizationId: 2n,
        system: false,
        role: 'superadmin',
      });
    });

    it('keeps the bypass when the named tenant does not exist (nothing to scope to)', async () => {
      userAccess.load.mockResolvedValue(
        accessOf({
          role: 'superadmin',
          organizationId: null,
          homeBranchId: null,
        }),
      );
      const ctx = await middleware.buildContext(
        request({ authorization: tokenFor(10n), 'x-organization': 'missing' }),
      );
      expect(ctx).toMatchObject({ organizationId: null, system: true });
    });

    it('does not let a tenant user change tenant through headers', async () => {
      const ctx = await middleware.buildContext(
        request({ authorization: tokenFor(10n), 'x-organization-id': '2' }),
      );
      expect(ctx.organizationId).toBe(5n);
      expect(ctx.system).toBe(false);
    });

    it('treats a forged token as anonymous', async () => {
      const forged = `Bearer ${jwt.sign({ sub: '1', role: 'superadmin' }, 'wrong-secret')}`;
      const ctx = await middleware.buildContext(
        request({ authorization: forged }),
      );
      expect(userAccess.load).not.toHaveBeenCalled();
      expect(ctx).toMatchObject({
        organizationId: 1n,
        system: false,
        accountStatus: null,
        source: 'default',
      });
    });
  });

  describe('anonymous requests', () => {
    it('uses the X-Organization slug header', async () => {
      const ctx = await middleware.buildContext(
        request({ 'x-organization': 'tyre-clinic' }),
      );
      expect(ctx).toMatchObject({
        organizationId: 2n,
        system: false,
        source: 'header',
      });
    });

    it('uses the first subdomain of the host when it names an organization', async () => {
      const ctx = await middleware.buildContext(
        request({ host: 'tyre-clinic.dental.example.com:443' }),
      );
      expect(ctx).toMatchObject({ organizationId: 2n, source: 'host' });
    });

    it('ignores generic subdomains and falls back to the default organization', async () => {
      for (const host of [
        'www.example.com',
        'api.example.com',
        'localhost:5000',
        '127.0.0.1:5000',
        'example.com',
      ]) {
        const ctx = await middleware.buildContext(request({ host }));
        expect(ctx).toMatchObject({ organizationId: 1n, source: 'default' });
      }
    });

    it('yields no tenant when nothing resolves (fail closed)', async () => {
      resolver.defaultOrganizationId.mockResolvedValue(null);
      const ctx = await middleware.buildContext(
        request({ 'x-organization': 'unknown' }),
      );
      expect(ctx).toMatchObject({
        organizationId: null,
        system: false,
        source: 'none',
      });
    });
  });

  describe('use()', () => {
    it('runs the rest of the request inside the tenant scope', async () => {
      let seen = EMPTY_TENANT;
      await middleware.use(
        request({ authorization: tokenFor(10n) }),
        {} as any,
        () => {
          seen = currentTenant();
        },
      );
      expect(seen.organizationId).toBe(5n);
      expect(currentTenant()).toEqual(EMPTY_TENANT);
    });

    it('still calls next() with an empty tenant when resolution throws', async () => {
      resolver.defaultOrganizationId.mockRejectedValue(new Error('db down'));
      const next = jest.fn(() => {
        expect(currentTenant()).toEqual(EMPTY_TENANT);
      });
      await middleware.use(request(), {} as any, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
