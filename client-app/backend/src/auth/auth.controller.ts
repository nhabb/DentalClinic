import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Query,
  HttpCode,
  HttpStatus,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { Public } from '../shared/common/decorators/public.decorator';
import { RequestUser } from '../shared/common/guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @ApiOperation({
    summary: 'Patient self-registration in the clinic the request resolves to',
  })
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Get('set-password/validate')
  @ApiOperation({
    summary: 'Check whether a password setup link is still valid',
  })
  async validateSetupToken(@Query('token') token: string) {
    return this.authService.validateSetupToken(token ?? '');
  }

  @Public()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a password setup link sent to a clinic-created account',
  })
  async setPassword(@Body() dto: SetPasswordDto) {
    return this.authService.setPassword(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email + password login; returns the API token' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('provision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Exchange a Supabase OAuth token for an API token (creates the patient on first login)',
  })
  async provision(@Headers('authorization') authHeader: string) {
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    if (!token) throw new UnauthorizedException('Missing token');
    return this.authService.provision(token);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The current user with their organization and home branch',
  })
  async getMe(@Request() req: { user: RequestUser }) {
    return this.authService.getMe(Number(req.user.id));
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  logout() {
    return { message: 'Logged out successfully' };
  }
}
