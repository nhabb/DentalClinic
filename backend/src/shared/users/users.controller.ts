import { UseGuards,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  @ApiOperation({ summary: 'Create user in DB after Supabase signup (public)' })
  register(@Body() body: { email: string; first_name: string; last_name: string; phone?: string; role?: string }) {
    return this.usersService.create(body);
  }

  @Get('by-email')
  @ApiOperation({ summary: 'Look up a user id by email (public, for demo login)' })
  @ApiQuery({ name: 'email', required: true })
  findByEmail(@Query('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get('doctors')
  @ApiOperation({ summary: 'List all doctor/admin users (public)' })
  findDoctors() {
    return this.usersService.findAll('admin');
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List all users (optionally filtered by role)' })
  @ApiQuery({ name: 'role', required: false, enum: ['patient', 'admin'] })
  findAll(@Query('role') role?: string) {
    return this.usersService.findAll(role);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a user by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findById(BigInt(id));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user profile fields' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(BigInt(id), dto);
  }

  @Patch(':id/password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change user password (requires old password)' })
  changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(BigInt(id), dto);
  }
}
