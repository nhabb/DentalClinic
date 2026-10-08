import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runAsSystem } from './tenant-context';
import { RolesService } from '../authorization/roles.service';
import { ADMIN_ROLE_KEY } from '../authorization/permissions';

const CACHE_TTL_MS = 60_000;

/**
 * What the database currently says about an account. The JWT only proves
 * identity; everything that decides what the user may do comes from here, so
 * deactivating a user, changing their role, its permissions or their branch
 * takes effect within CACHE_TTL_MS without waiting for the token to expire.
 */
export interface UserAccess {
  userId: bigint;
  organizationId: bigint | null;
  organizationActive: boolean;
  role: string;
  /** Permission keys the role holds in this organization. */
  permissions: string[];
  isActive: boolean;
  homeBranchId: bigint | null;
  restrictToBranch: boolean;
}

interface CacheEntry {
  access: UserAccess | null;
  expires: number;
}

@Injectable()
export class UserAccessService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  /** Access record for a user, or null when the account does not exist. */
  async load(userId: bigint): Promise<UserAccess | null> {
    const key = userId.toString();
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.access;

    const user = await runAsSystem(() =>
      this.prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          organization_id: true,
          role: true,
          is_active: true,
          branch_id: true,
          restrict_to_branch: true,
          organization: { select: { is_active: true } },
        },
      }),
    );

    const access: UserAccess | null = user
      ? {
          userId: user.id,
          organizationId: user.organization_id,
          // Platform accounts have no organization; treat that as active.
          organizationActive: user.organization?.is_active ?? true,
          role: user.role,
          permissions:
            user.organization_id === null
              ? []
              : await this.roles.permissionsFor(
                  user.organization_id,
                  user.role,
                ),
          isActive: user.is_active,
          homeBranchId: user.branch_id,
          restrictToBranch: user.restrict_to_branch,
        }
      : null;
    this.cache.set(key, { access, expires: Date.now() + CACHE_TTL_MS });
    return access;
  }

  /** Forget one user (after changing their status, role or branch) or everyone. */
  invalidate(userId?: bigint): void {
    if (userId === undefined) this.cache.clear();
    else this.cache.delete(userId.toString());
  }

  /**
   * Branch the user is confined to, or null for the whole organization.
   * Administrators are never confined; other staff are when an admin ticked
   * "restrict to branch" and they have a home branch.
   */
  static branchScopeOf(access: UserAccess): bigint | null {
    if (access.role === ADMIN_ROLE_KEY) return null;
    if (!access.restrictToBranch) return null;
    return access.homeBranchId;
  }
}
