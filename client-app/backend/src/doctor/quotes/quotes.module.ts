import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { QuotesController } from './quotes.controller';
import { PlanService } from './plan.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [QuotesController],
  providers: [PlanService],
  exports: [PlanService],
})
export class QuotesModule {}
