import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { SchemaSummary } from './schema-summary';
import { ToolRunner } from './tools/tool-runner';
import { AppointmentsModule } from '../../doctor/appointments/appointments.module';
import { AppointmentSlotsModule } from '../../doctor/appointment-slots/appointment-slots.module';
import { PatientsModule } from '../patients/patients.module';
import { InventoryModule } from '../../doctor/inventory/inventory.module';
import { UsersModule } from '../../shared/users/users.module';
import { ExpensesModule } from '../../doctor/expenses/expenses.module';
import { BillingModule } from '../../doctor/billing/billing.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { SpecialistsModule } from '../../doctor/specialists/specialists.module';
import { LabModule } from '../../doctor/lab/lab.module';

/**
 * The clinic AI assistant. The tools call the feature modules' own services,
 * so this module imports them rather than reaching into the database itself.
 */
@Module({
  imports: [
    AppointmentsModule,
    AppointmentSlotsModule,
    PatientsModule,
    InventoryModule,
    UsersModule,
    ExpensesModule,
    BillingModule,
    PrismaModule,
    SpecialistsModule,
    LabModule,
  ],
  controllers: [AgentController],
  providers: [AgentService, ToolRunner, SchemaSummary],
})
export class AgentModule {}
