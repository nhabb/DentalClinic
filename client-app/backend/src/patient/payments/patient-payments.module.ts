import { Module } from '@nestjs/common';
import { PatientPaymentsController } from './patient-payments.controller';
import { BillingModule } from '../../doctor/billing/billing.module';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [BillingModule, PatientsModule],
  controllers: [PatientPaymentsController],
})
export class PatientPaymentsModule {}
