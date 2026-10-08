import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { currentTenant, toBigIntOrNull } from '../../tenant/tenant-context';

/**
 * Layer 4 of API protection: staff confined to one branch may not name another
 * branch in a request. RLS would reject the write anyway (as a 403 from the
 * exception filter), but checking up front gives a clear message and also
 * covers reads, which RLS silently filters instead of rejecting.
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const scope = currentTenant().branchScopeId;
    if (scope === null) return true;

    const request = context.switchToHttp().getRequest<{
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
    }>();
    for (const source of [request.body, request.query]) {
      const requested = toBigIntOrNull(source?.branch_id);
      if (requested !== null && requested !== scope) {
        throw new ForbiddenException(
          `Your account is limited to branch ${scope}; branch ${requested} is not accessible`,
        );
      }
    }
    return true;
  }
}
