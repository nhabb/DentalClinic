import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenant, runAsSystem } from './tenant-context';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  id: bigint | null;
  expires: number;
}

/**
 * Looks organizations up for requests that carry no JWT (signup, login, public
 * doctor list...). Lookups run with RLS bypassed because, by definition, there is
 * no tenant yet. Results are cached briefly; slugs change rarely.
 */
@Injectable()
export class TenantResolverService {
  private readonly logger = new Logger(TenantResolverService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /** organizations.id for a slug, or null if unknown / inactive. */
  async organizationIdBySlug(slug: string): Promise<bigint | null> {
    const key = `slug:${slug.toLowerCase()}`;
    return this.cached(key, async () => {
      const org = await runAsSystem(() =>
        this.prisma.organizations.findFirst({
          where: { slug: slug.toLowerCase(), is_active: true },
          select: { id: true },
        }),
      );
      return org?.id ?? null;
    });
  }

  /** organizations.id if that id exists and is active. */
  async organizationIdById(id: bigint): Promise<bigint | null> {
    return this.cached(`id:${id}`, async () => {
      const org = await runAsSystem(() =>
        this.prisma.organizations.findFirst({
          where: { id, is_active: true },
          select: { id: true },
        }),
      );
      return org?.id ?? null;
    });
  }

  /**
   * Organization used when a request names none: DEFAULT_ORGANIZATION_SLUG from
   * the environment, otherwise the only active organization if there is exactly one.
   */
  async defaultOrganizationId(): Promise<bigint | null> {
    const slug = process.env.DEFAULT_ORGANIZATION_SLUG?.trim();
    if (slug) return this.organizationIdBySlug(slug);

    return this.cached('default', async () => {
      const orgs = await runAsSystem(() =>
        this.prisma.organizations.findMany({
          where: { is_active: true },
          select: { id: true },
          take: 2,
        }),
      );
      if (orgs.length === 1) return orgs[0].id;
      if (orgs.length > 1) {
        this.logger.warn(
          'Several organizations exist and DEFAULT_ORGANIZATION_SLUG is not set; unauthenticated requests get no tenant.',
        );
      }
      return null;
    });
  }

  /**
   * Branch to use for a new row: the explicit value if given, else the current
   * user's home branch, else the organization's default branch. Mirrors the SQL
   * default `app.default_branch_id()` for code that needs the value up front.
   */
  async resolveBranchId(explicit?: number | bigint | null): Promise<bigint> {
    if (explicit !== undefined && explicit !== null) {
      const id = BigInt(explicit);
      // RLS guarantees we only ever see branches of the current organization.
      const branch = await this.prisma.branches.findFirst({
        where: { id, is_active: true },
        select: { id: true },
      });
      if (!branch)
        throw new NotFoundException('Branch not found in this organization');
      return branch.id;
    }
    const ctx = currentTenant();
    if (ctx.homeBranchId !== null) return ctx.homeBranchId;

    const branch =
      (await this.prisma.branches.findFirst({
        where: { is_default: true, is_active: true },
        select: { id: true },
      })) ??
      (await this.prisma.branches.findFirst({
        where: { is_active: true },
        orderBy: { id: 'asc' },
        select: { id: true },
      }));
    if (!branch)
      throw new NotFoundException('This organization has no active branch yet');
    return branch.id;
  }

  /** Drop cached lookups (after creating or renaming an organization). */
  invalidate(): void {
    this.cache.clear();
  }

  private async cached(
    key: string,
    load: () => Promise<bigint | null>,
  ): Promise<bigint | null> {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.id;
    const id = await load();
    this.cache.set(key, { id, expires: Date.now() + CACHE_TTL_MS });
    return id;
  }
}
