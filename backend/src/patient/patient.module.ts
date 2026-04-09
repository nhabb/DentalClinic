import { Module } from '@nestjs/common';
import { PatientsModule } from './patients/patients.module';
import { PatientDocumentsModule } from './patient-documents/patient-documents.module';
import { NotificationsModule } from '../shared/notifications/notifications.module';
import { AgentModule } from './agent/agent.module';

/**
 * Patient portal modules.
 * Dev scope: patient profiles, documents, notifications, AI agent.
 */
@Module({
  imports: [
    PatientsModule,
    PatientDocumentsModule,
    NotificationsModule,
    AgentModule,
  ],
})
export class PatientModule {}
