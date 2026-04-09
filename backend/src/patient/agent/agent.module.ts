import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AppointmentsModule } from '../../doctor/appointments/appointments.module';
import { AppointmentSlotsModule } from '../../doctor/appointment-slots/appointment-slots.module';
import { PatientsModule } from '../patients/patients.module';
import { InventoryModule } from '../../doctor/inventory/inventory.module';
import { UsersModule } from '../../shared/users/users.module';
import { NotificationsModule } from '../../shared/notifications/notifications.module';

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
