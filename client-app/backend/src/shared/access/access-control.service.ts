import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ORG_ADMIN_ROLES,
  STAFF_ROLES,
} from '../common/decorators/roles.decorator';

/** The caller, as JwtAuthGuard puts it on `request.user`. */
export interface Actor {
  id: string | number | bigint;
  role: string;
}

/**
 * Layer 3 of API protection: record ownership.
 *
 * Roles say which endpoints a user may call; this service says which rows.
 * Staff may act on anyone in their organization (RLS already limits them to
 * it). Patients may only act on themselves: their own user row, their own
 * patient profile and anything hanging off it.
 */
@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  isStaff(actor: Actor): boolean {
    return STAFF_ROLES.includes(actor.role);
  }

  isOrgAdmin(actor: Actor): boolean {
    return ORG_ADMIN_ROLES.includes(actor.role);
  }

  /** Throws unless the actor is staff or is the user in question. */
  assertSelfOrStaff(actor: Actor, userId: string | number | bigint): void {
    if (this.isStaff(actor)) return;
    if (BigInt(actor.id) !== BigInt(userId)) {
      throw new ForbiddenException('You can only access your own data');
    }
  }

  /** Throws unless the actor is the user in question (password changes). */
  assertSelf(actor: Actor, userId: string | number | bigint): void {
    if (BigInt(actor.id) !== BigInt(userId)) {
      throw new ForbiddenException('You can only do this for your own account');
    }
  }

  /** The actor's own patient profile id; 403 for staff without a profile. */
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
   * Throws unless the actor is staff or the patient profile belongs to them.
   * 404 when the profile is not visible at all (other organization or missing).
   */
  async assertPatientProfileAccess(
    actor: Actor,
    profileId: string | number | bigint,
  ): Promise<void> {
    if (this.isStaff(actor)) return;
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { id: BigInt(profileId) },
      select: { user_id: true },
    });
    if (!profile) throw new NotFoundException('Patient profile not found');
    if (profile.user_id !== BigInt(actor.id)) {
      throw new ForbiddenException('This patient record is not yours');
    }
  }
}
