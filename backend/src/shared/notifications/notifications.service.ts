import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationType =
  | 'appointment_booked'
  | 'appointment_confirmed'
  | 'appointment_cancelled'
  | 'appointment_completed'
  | 'appointment_no_show';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    user_id: bigint;
    title: string;
    message: string;
    type: NotificationType;
  }) {
    return this.prisma.notifications.create({
      data: {
        user_id: params.user_id,
        title: params.title,
        message: params.message,
        type: params.type,
      },
    });
  }

  async findAll(userId: bigint, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notifications.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notifications.count({ where: { user_id: userId } }),
      this.prisma.notifications.count({
        where: { user_id: userId, is_read: false },
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit), unreadCount },
    };
  }

  async getUnreadCount(userId: bigint) {
    const count = await this.prisma.notifications.count({
      where: { user_id: userId, is_read: false },
    });
    return { count };
  }

  async markRead(id: bigint, userId: bigint) {
    const notification = await this.prisma.notifications.findFirst({
      where: { id, user_id: userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.notifications.update({
      where: { id },
      data: { is_read: true },
    });
  }

  async markAllRead(userId: bigint) {
    await this.prisma.notifications.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });
    return { message: 'All notifications marked as read' };
  }
}
