import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountSetupModule } from '../shared/account-setup/account-setup.module';
import { jwtSecret } from '../shared/common/app-jwt';

/**
 * Issues the backend's own JWTs (login, signup, OAuth provision) and the
 * password-setup flow. Token verification lives in the global JwtAuthGuard
 * (src/shared/common/guards), so nothing here needs Passport.
 */
@Module({
  imports: [
    PrismaModule,
    AccountSetupModule,
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
