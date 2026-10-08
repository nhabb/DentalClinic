import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminsService } from './admins.service';
import { CreateAdminDto, SetAdminActiveDto } from './dto/admin.dto';
import { PlatformUser } from '../auth/auth.service';

@ApiBearerAuth()
@ApiTags('Platform admins')
@Controller('admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get()
  @ApiOperation({ summary: 'List platform admins' })
  list() {
    return this.admins.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a platform admin' })
  create(@Body() dto: CreateAdminDto) {
    return this.admins.create(dto);
  }

  @Patch(':id/active')
  @ApiOperation({ summary: 'Deactivate or reactivate a platform admin' })
  setActive(
    @Req() req: { user: PlatformUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetAdminActiveDto,
  ) {
    return this.admins.setActive(req.user.id, BigInt(id), dto.is_active);
  }
}
