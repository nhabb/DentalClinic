import type { UsersService } from '../../../shared/users/users.service';
import type { ToolHandlers } from './tool-handler';

/** Staff of the clinic. */
export function teamTools(users: UsersService): ToolHandlers {
  return {
    // Active staff: in some clinics the treating doctors hold the admin role.
    list_doctors: () => users.findStaff(),
  };
}
