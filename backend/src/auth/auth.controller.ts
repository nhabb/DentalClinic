import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('provision')
  @HttpCode(HttpStatus.OK)
  async provision(@Headers('authorization') authHeader: string) {
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    if (!token) throw new UnauthorizedException('Missing token');
    return this.authService.provision(token);
  }

  @Get('me')
  @UseGuards(OptionalJwtAuthGuard)
  async getMe(@Request() req) {
    if (!req.user) return { ok: false };
    const user = await this.authService.getMe(req.user.id);
    if (!user) return { ok: false };
    return { ok: true, ...user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout() {
    return { message: 'Logged out successfully' };
  }
}
