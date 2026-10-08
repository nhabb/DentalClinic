import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PlatformAuthGuard } from './auth/platform-auth.guard';
import { OrganizationsModule } from './organizations/organizations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AdminsModule } from './admins/admins.module';

/**
 * Platform console API.
 *
 * Every route requires a platform token (PlatformAuthGuard, global) except the
 * login route. The database connection is the operator's: it bypasses the
 * clinics' row-level security, which is exactly what onboarding and monitoring
 * need, so this API must never be exposed to clinic users.
 */
@Module({
  imports: [PrismaModule, AuthModule, OrganizationsModule, DashboardModule, AdminsModule],
  providers: [{ provide: APP_GUARD, useClass: PlatformAuthGuard }],
})
export class AppModule {}
