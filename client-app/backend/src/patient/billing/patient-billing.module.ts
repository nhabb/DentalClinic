import { Module } from '@nestjs/common';
import { PatientBillingController } from './patient-billing.controller';
import { BillingModule } from '../../doctor/billing/billing.module';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [BillingModule, PatientsModule],
  controllers: [PatientBillingController],
})
export class PatientBillingModule {}
