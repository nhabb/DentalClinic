import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AppointmentsModule } from '../../doctor/appointments/appointments.module';
import { AppointmentSlotsModule } from '../../doctor/appointment-slots/appointment-slots.module';
import { PatientsModule } from '../patients/patients.module';
import { InventoryModule } from '../../doctor/inventory/inventory.module';
import { UsersModule } from '../../shared/users/users.module';
import { NotificationsModule } from '../../shared/notifications/notifications.module';
import { ExpensesModule } from '../../doctor/expenses/expenses.module';
import { BillingModule } from '../../doctor/billing/billing.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [
    // why did we import these modules? Because the AgentModule needs to use the services provided by these modules to perform its functionality. For example, the AgentService might need to interact with appointments, appointment slots, patient information, inventory management, user management, notifications, payments, expenses, and billing in order to effectively manage the operations of the medical clinic. By importing these modules, we can inject their services into the AgentService and use their functionality without having to duplicate code or create tight coupling between the modules. This allows us to keep our code organized and maintainable while still enabling the AgentModule to access the necessary features provided by these other modules.
    AppointmentsModule,
    AppointmentSlotsModule,
    PatientsModule,
    InventoryModule,
    UsersModule,
    NotificationsModule,
    ExpensesModule,
    BillingModule,
    PrismaModule,
  ],
  controllers: [AgentController],
  providers: [AgentService], //why didnt we export the service? Because the AgentService is only used internally within the AgentModule and is not intended to be used by other modules. By not exporting it, we keep the service encapsulated within the module, which helps to maintain a clear separation of concerns and prevents other modules from directly accessing or depending on the internal implementation of the AgentService. This allows us to change or refactor the AgentService without affecting other parts of the application, as long as we keep the public interface of the AgentController consistent. If we were to export the service, it could lead to tight coupling between modules and make it harder to maintain and evolve our codebase over time.
}) //when do we export a service? We export a service when we want to make its functionality available to other modules in our application. For example, if the AgentService provides some business logic or operations that other modules (like AppointmentsModule, PatientsModule, etc.) need to use, then we would export the AgentService so that it can be imported and used by those other modules. However, if the AgentService is only meant to be used internally within the AgentModule and does not need to be accessed by other modules, then we can keep it private by not exporting it. This helps to maintain a clear separation of concerns and prevents other parts of the application from directly depending on the internal implementation of the AgentService, which can make our code more maintainable and flexible in the long run.
export class AgentModule {}
