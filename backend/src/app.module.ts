import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AppointmentSlotsModule } from './appointment-slots/appointment-slots.module';
import { PatientRecordsModule } from './patient-records/patient-records.module';
import { PatientDocumentsModule } from './patient-documents/patient-documents.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    PatientsModule,
    AppointmentsModule,
    AppointmentSlotsModule,
    PatientRecordsModule,
    PatientDocumentsModule,
    InventoryModule,
    NotificationsModule,
    AgentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
