import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './shared/prisma/prisma.module';
import { TenantModule } from './shared/tenant/tenant.module';
import { TenancyModule } from './shared/tenancy/tenancy.module';
import { AccessModule } from './shared/access/access.module';
import { UsersModule } from './shared/users/users.module';
import { AuthModule } from './auth/auth.module';
import { DoctorModule } from './doctor/doctor.module';
import { PatientModule } from './patient/patient.module';
import { JwtAuthGuard } from './shared/common/guards/jwt-auth.guard';
import { RolesGuard } from './shared/common/guards/roles.guard';
import { BranchScopeGuard } from './shared/common/guards/branch-scope.guard';

/**
 * API protection is layered; every layer applies to every route unless opted out:
 *   1. JwtAuthGuard    — valid token + active account + active clinic (@Public() opts out)
 *   2. RolesGuard      — @Roles() on the controller or handler
 *   3. ownership       — AccessControlService calls inside controllers (own user / own profile)
 *   4. BranchScopeGuard — branch-confined staff cannot name another branch
 *   5. row-level security in PostgreSQL — the tenant boundary, enforced even for raw SQL
 */
@Module({
  imports: [
    PrismaModule,
    // Request-scoped tenant context (which organization a request acts for).
    TenantModule,
    // Organizations + branches management API.
    TenancyModule,
    // Ownership checks.
    AccessModule,
    UsersModule,
    AuthModule,
    DoctorModule,
    PatientModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: BranchScopeGuard },
  ],
})
export class AppModule {}
