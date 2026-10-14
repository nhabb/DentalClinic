import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { runAsSystem } from '../tenant/tenant-context';

/** Why a password confirmation did not pass. */
export type ConfirmationFailure =
  | 'wrong_password'
  | 'no_password'
  | 'unknown_user'
  | 'locked';

/** Wrong passwords allowed per account before confirmations pause. */
export const MAX_FAILURES = 5;
/** How long confirmations pause after MAX_FAILURES wrong passwords. */
export const LOCK_MS = 15 * 60 * 1000;

/**
 * Re-checks the signed-in person's own password for a dangerous action.
 *
 * A valid session token proves someone signed in earlier; it does not prove
 * the person at the keyboard right now is the admin. Deleting money records
 * asks them to type the password again, and this is the one place that check
 * is made. Accounts that sign in with Google have no password here and are
 * told so instead of being silently refused.
 */
@Injectable()
export class PasswordConfirmationService {
  /** Recent wrong passwords per account (this process only; enough to blunt a stolen-token guess loop). */
  private readonly failures = new Map<
    string,
    { count: number; until: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async check(
    userId: bigint,
    password: string,
  ): Promise<ConfirmationFailure | null> {
    const key = userId.toString();
    const state = this.failures.get(key);
    if (state && state.until > Date.now()) return 'locked';

    const failure = await this.compare(userId, password);
    if (failure === 'wrong_password') {
      const count = (state?.count ?? 0) + 1;
      const until = count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0;
      this.failures.set(key, { count: until ? 0 : count, until });
      await this.audit.record({
        actorId: userId,
        action: 'auth.password_confirmation.failed',
        table: 'users',
        recordId: userId,
        after: { attempt: count, locked: until > 0 },
      });
      return until ? 'locked' : failure;
    }
    if (failure === null) this.failures.delete(key);
    return failure;
  }

  private async compare(
    userId: bigint,
    password: string,
  ): Promise<ConfirmationFailure | null> {
    // Own-account lookup by the id in the token. As system, because a platform
    // superadmin acting inside a clinic has no row visible under that clinic's
    // tenant filter (the same reason login looks accounts up this way).
    const user = await runAsSystem(() =>
      this.prisma.users.findUnique({
        where: { id: userId },
        select: { password_hash: true },
      }),
    );
    if (!user) return 'unknown_user';
    if (!user.password_hash || user.password_hash === 'oauth')
      return 'no_password';
    const ok = await bcrypt.compare(password, user.password_hash);
    return ok ? null : 'wrong_password';
  }
}
