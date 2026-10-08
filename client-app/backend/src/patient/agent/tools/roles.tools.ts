import type { RolesService } from '../../../shared/authorization/roles.service';
import { describeAccess } from '../agent-access';
import type { ToolHandlers } from './tool-handler';

/** What the caller, and the clinic's roles, are allowed to do. */
export function rolesTools(roles: RolesService): ToolHandlers {
  return {
    get_my_permissions: (_, { user }) =>
      Promise.resolve({ role: user.role, ...describeAccess(user) }),

    list_roles: () => roles.list(),
  };
}
