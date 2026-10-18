import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PatientLedgerService } from './patient-ledger.service';
import { MoneyService } from './money.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { AuditModule } from '../../shared/audit/audit.module';
import { StepUpModule } from '../../shared/step-up/step-up.module';
// The statement is the plan and the ledger side by side, so billing reads the
// plan. The dependency only goes this way: the plan knows nothing of money.
import { QuotesModule } from '../quotes/quotes.module';

@Module({
  imports: [PrismaModule, AuditModule, StepUpModule, QuotesModule],
  controllers: [BillingController],
  providers: [BillingService, PatientLedgerService, MoneyService],
  exports: [BillingService, PatientLedgerService, MoneyService],
})
export class BillingModule {}
