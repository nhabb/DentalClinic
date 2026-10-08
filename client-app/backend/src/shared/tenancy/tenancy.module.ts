import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountSetupModule } from '../account-setup/account-setup.module';
import { TenancyService } from './tenancy.service';
import { OrganizationsController } from './organizations.controller';
import { BranchesController } from './branches.controller';

/** Organizations (tenants) and branches (clinic locations) management API. */
@Module({
  imports: [PrismaModule, AccountSetupModule],
  controllers: [OrganizationsController, BranchesController],
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule {}
