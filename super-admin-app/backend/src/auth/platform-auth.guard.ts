import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { bearerToken, verifyPlatformToken } from './platform-token';
import { AuthService, PlatformUser } from './auth.service';

/**
 * Global guard: every route needs a platform token for an active platform
 * admin. The account is re-read (cached) on each request so removing an admin
 * takes effect immediately rather than at token expiry.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: PlatformUser }>();
    const payload = verifyPlatformToken(bearerToken(request.headers.authorization));
    if (!payload) throw new UnauthorizedException('A valid platform token is required');

    const user = await this.auth.activeAdmin(BigInt(payload.sub));
    if (!user) throw new UnauthorizedException('This platform account is no longer active');

    request.user = user;
    return true;
  }
}
