import { Module } from '@nestjs/common';
import { PatientsModule } from './patients/patients.module';
import { PatientDocumentsModule } from './patient-documents/patient-documents.module';
import { NotificationsModule } from '../shared/notifications/notifications.module';
import { AgentModule } from './agent/agent.module';
import { PatientAppointmentsModule } from './appointments/patient-appointments.module';
import { PatientRecordsViewModule } from './patient-records/patient-records-view.module';
import { AvailableSlotsModule } from './available-slots/available-slots.module';
import { ClinicProfileModule } from './clinic-profile/clinic-profile.module';
import { PatientPaymentsModule } from './payments/patient-payments.module';
import { PatientBillingModule } from './billing/patient-billing.module';

@Module({
  imports: [
    PatientsModule,
    PatientDocumentsModule,
    NotificationsModule,
    AgentModule,
    PatientAppointmentsModule,
    PatientRecordsViewModule,
    AvailableSlotsModule,
    ClinicProfileModule,
    PatientPaymentsModule,
    PatientBillingModule,
  ],
})
export class PatientModule {}
