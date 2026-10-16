import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { PlanQuoteService } from './plan-quote.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [QuotesController],
  providers: [QuotesService, PlanQuoteService],
  exports: [QuotesService, PlanQuoteService],
})
export class QuotesModule {}
