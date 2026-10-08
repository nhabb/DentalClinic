import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantResolverService } from './tenant-resolver.service';
import { UserAccessService } from './user-access.service';
import { TenantContextMiddleware } from './tenant.middleware';

/**
 * Request-scoped tenancy: resolves which organization a request acts for, what
 * the database says about the account, and makes both available to the
 * database layer (see tenant-context.ts).
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    TenantResolverService,
    UserAccessService,
    TenantContextMiddleware,
  ],
  exports: [TenantResolverService, UserAccessService, TenantContextMiddleware],
})
export class TenantModule {}
