import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { RequestUser } from '../common/guards/jwt-auth.guard';
import { AccessControlService } from '../access/access-control.service';
import { NotificationsService } from './notifications.service';

/** A user's notifications. `user_id` must be the caller unless the caller is staff. */
@ApiBearerAuth()
@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly access: AccessControlService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for a user' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Req() req: { user: RequestUser },
    @Query('user_id', ParseIntPipe) userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.access.assertSelfOrPermission(req.user, userId, 'staff:manage');
    return this.notificationsService.findAll(BigInt(userId), page, limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count for a user' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  getUnreadCount(
    @Req() req: { user: RequestUser },
    @Query('user_id', ParseIntPipe) userId: number,
  ) {
    this.access.assertSelfOrPermission(req.user, userId, 'staff:manage');
    return this.notificationsService.getUnreadCount(BigInt(userId));
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for a user' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  markAllRead(
    @Req() req: { user: RequestUser },
    @Query('user_id', ParseIntPipe) userId: number,
  ) {
    this.access.assertSelfOrPermission(req.user, userId, 'staff:manage');
    return this.notificationsService.markAllRead(BigInt(userId));
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  markRead(
    @Req() req: { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Query('user_id', ParseIntPipe) userId: number,
  ) {
    this.access.assertSelfOrPermission(req.user, userId, 'staff:manage');
    return this.notificationsService.markRead(BigInt(id), BigInt(userId));
  }
}
