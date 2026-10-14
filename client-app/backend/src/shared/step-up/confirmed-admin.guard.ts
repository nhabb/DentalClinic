import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_ROLE_KEY } from '../authorization/permissions';
import type { RequestUser } from '../common/guards/jwt-auth.guard';
import { PasswordConfirmationService } from './password-confirmation.service';

/** Header the client sends with the admin's password, once, for this request only. */
export const CONFIRM_PASSWORD_HEADER = 'x-confirm-password';

/** Machine-readable reasons the client can act on (show the password prompt, explain OAuth). */
export const CONFIRMATION_REQUIRED = 'password_confirmation_required';
export const CONFIRMATION_FAILED = 'password_confirmation_failed';
export const CONFIRMATION_UNAVAILABLE = 'password_confirmation_unavailable';
export const CONFIRMATION_LOCKED = 'password_confirmation_locked';

/**
 * Step-up protection for deleting money records: the caller must be a clinic
 * admin (or a platform superadmin acting inside the clinic) AND must send
 * their own password in the X-Confirm-Password header for this very request.
 * Runs after the global guards, so the token and the route's permission have
 * already been checked; this adds "who is at the keyboard right now".
 */
@Injectable()
export class ConfirmedAdminGuard implements CanActivate {
  constructor(private readonly passwords: PasswordConfirmationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Not signed in');
    if (user.role !== ADMIN_ROLE_KEY && user.role !== 'superadmin') {
      throw new ForbiddenException(
        'Only a clinic admin can delete billing records',
      );
    }

    const raw = req.headers[CONFIRM_PASSWORD_HEADER];
    const password = Array.isArray(raw) ? raw[0] : raw;
    if (!password) {
      throw new ForbiddenException({
        statusCode: 403,
        code: CONFIRMATION_REQUIRED,
        message: 'Re-enter your password to confirm this deletion',
      });
    }

    const failure = await this.passwords.check(BigInt(user.id), password);
    if (failure === 'no_password') {
      throw new ForbiddenException({
        statusCode: 403,
        code: CONFIRMATION_UNAVAILABLE,
        message:
          'This account signs in with Google and has no password to confirm with; set a password first',
      });
    }
    if (failure === 'locked') {
      throw new ForbiddenException({
        statusCode: 403,
        code: CONFIRMATION_LOCKED,
        message:
          'Too many wrong passwords; confirmations are paused for a while',
      });
    }
    if (failure) {
      throw new ForbiddenException({
        statusCode: 403,
        code: CONFIRMATION_FAILED,
        message: 'Wrong password',
      });
    }
    return true;
  }
}
