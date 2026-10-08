import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PATIENT_ROLE_KEY } from '../authorization/permissions';

/** The caller, as JwtAuthGuard puts it on `request.user`. */
export interface Actor {
  id: string | number | bigint;
  role: string;
  permissions: string[];
}

const PLATFORM_ROLE = 'superadmin';

/**
 * Layer 3 of API protection: record ownership, combined with permissions.
 *
 * @RequirePermissions() on a route answers "may this role call it at all?".
 * This service answers "on which rows?" for the routes patients and staff
 * share: a patient may only touch their own user row, their own profile and
 * anything hanging off it; staff need the stated permission to touch others'.
 */
@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  isPatient(actor: Actor): boolean {
    return actor.role === PATIENT_ROLE_KEY;
  }

  /** Anyone who is not a patient: clinic staff of any role, or the platform admin. */
  isStaff(actor: Actor): boolean {
    return !this.isPatient(actor);
  }

  hasPermission(actor: Actor, permission: string): boolean {
    return (
      actor.role === PLATFORM_ROLE || actor.permissions.includes(permission)
    );
  }

  /** Throws unless the actor's role holds the permission. */
  assertPermission(actor: Actor, permission: string): void {
    if (!this.hasPermission(actor, permission)) {
      throw new ForbiddenException(
        `Your role "${actor.role}" lacks the permission: ${permission}`,
      );
    }
  }

  /**
   * Throws unless the actor is the user in question, or holds the permission
   * that allows acting on other users.
   */
  assertSelfOrPermission(
    actor: Actor,
    userId: string | number | bigint,
    permission: string,
  ): void {
    if (BigInt(actor.id) === BigInt(userId)) return;
    if (this.hasPermission(actor, permission)) return;
    throw new ForbiddenException(
      this.isPatient(actor)
        ? 'You can only access your own data'
        : `Your role "${actor.role}" lacks the permission: ${permission}`,
    );
  }

  /** Throws unless the actor is the user in question (password changes). */
  assertSelf(actor: Actor, userId: string | number | bigint): void {
    if (BigInt(actor.id) !== BigInt(userId)) {
      throw new ForbiddenException('You can only do this for your own account');
    }
  }

  /** The actor's own patient profile id; 403 for accounts without a profile. */
  async ownPatientProfileId(actor: Actor): Promise<bigint> {
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { user_id: BigInt(actor.id) },
      select: { id: true },
    });
    if (!profile) {
      throw new ForbiddenException('This account has no patient profile');
    }
    return profile.id;
  }

  /**
   * Throws unless the patient profile belongs to the actor, or the actor holds
   * the permission that allows acting on other patients. 404 when the profile
   * is not visible at all (other organization or missing).
   */
  async assertPatientProfileAccess(
    actor: Actor,
    profileId: string | number | bigint,
    permission: string,
  ): Promise<void> {
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { id: BigInt(profileId) },
      select: { user_id: true },
    });
    if (!profile) throw new NotFoundException('Patient profile not found');
    if (profile.user_id === BigInt(actor.id)) return;
    this.assertPermission(actor, permission);
  }
}
