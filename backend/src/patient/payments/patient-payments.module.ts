import { Module } from '@nestjs/common';
import { PatientPaymentsController } from './patient-payments.controller';
import { PaymentsModule } from '../../doctor/payments/payments.module';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [PaymentsModule, PatientsModule],
  controllers: [PatientPaymentsController],
})
export class PatientPaymentsModule {}
