import type { UsersService } from '../../../shared/users/users.service';
import type { NotificationsService } from '../../../shared/notifications/notifications.service';
import type { ToolHandlers } from './tool-handler';

/** Staff of the clinic and messages to them. */
export function teamTools(
  users: UsersService,
  notifications: NotificationsService,
): ToolHandlers {
  return {
    // Active staff: in some clinics the treating doctors hold the admin role.
    list_doctors: () => users.findStaff(),

    send_notification: async (a) => {
      await notifications.create({
        user_id: a.id('user_id'),
        title: a.reqStr('title'),
        message: a.reqStr('message'),
        type: 'appointment_booked',
      });
      return { success: true };
    },
  };
}
