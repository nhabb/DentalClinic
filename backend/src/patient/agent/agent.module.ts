import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AppointmentsModule } from '../../doctor/appointments/appointments.module';
import { AppointmentSlotsModule } from '../../doctor/appointment-slots/appointment-slots.module';
import { PatientsModule } from '../patients/patients.module';
import { InventoryModule } from '../../doctor/inventory/inventory.module';
import { UsersModule } from '../../shared/users/users.module';
import { NotificationsModule } from '../../shared/notifications/notifications.module';
import { PaymentsModule } from '../../doctor/payments/payments.module';
import { ExpensesModule } from '../../doctor/expenses/expenses.module';
import { BillingModule } from '../../doctor/billing/billing.module';

@Module({
  imports: [
    AppointmentsModule,
    AppointmentSlotsModule,
    PatientsModule,
    InventoryModule,
    UsersModule,
    NotificationsModule,
    PaymentsModule,
    ExpensesModule,
    BillingModule,
  ],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
