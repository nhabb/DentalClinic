import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users (optionally filtered by role)' })
  @ApiQuery({ name: 'role', required: false, enum: ['patient', 'admin'] })
  findAll(@Query('role') role?: string) {
    return this.usersService.findAll(role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findById(BigInt(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user profile fields' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(BigInt(id), dto);
  }

  @Patch(':id/password')
  @ApiOperation({ summary: 'Change user password (requires old password)' })
  changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(BigInt(id), dto);
  }
}
