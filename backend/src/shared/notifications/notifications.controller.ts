import { UseGuards,
  Controller,
  Get,
  Patch,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for a user' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('user_id', ParseIntPipe) userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.notificationsService.findAll(BigInt(userId), page, limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for a user' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  getUnreadCount(@Query('user_id', ParseIntPipe) userId: number) {
    return this.notificationsService.getUnreadCount(BigInt(userId));
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  markRead(
    @Param('id', ParseIntPipe) id: number,
    @Query('user_id', ParseIntPipe) userId: number,
  ) {
    return this.notificationsService.markRead(BigInt(id), BigInt(userId));
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for a user' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  markAllRead(@Query('user_id', ParseIntPipe) userId: number) {
    return this.notificationsService.markAllRead(BigInt(userId));
  }
}
