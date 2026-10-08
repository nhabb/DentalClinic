import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';

/**
 * Roles and permissions: the catalog (permissions.ts), per-clinic roles
 * (RolesService) and the guard that enforces @RequirePermissions().
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class AuthorizationModule {}
