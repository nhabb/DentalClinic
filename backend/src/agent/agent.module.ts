import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AppointmentSlotsModule } from '../appointment-slots/appointment-slots.module';
import { PatientsModule } from '../patients/patients.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    AppointmentsModule,
    AppointmentSlotsModule,
    PatientsModule,
    InventoryModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
