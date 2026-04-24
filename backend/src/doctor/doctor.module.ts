import { Module } from '@nestjs/common';
import { AppointmentsModule } from './appointments/appointments.module';
import { AppointmentSlotsModule } from './appointment-slots/appointment-slots.module';
import { InventoryModule } from './inventory/inventory.module';
import { PatientRecordsModule } from './patient-records/patient-records.module';
import { ExpensesModule } from './expenses/expenses.module';
import { BillingModule } from './billing/billing.module';

/**
 * Doctor/Admin panel modules.
 * Dev scope: appointments, slots, inventory, patient records, payments, expenses, billing.
 */
@Module({
  imports: [
    AppointmentsModule,
    AppointmentSlotsModule,
    InventoryModule,
    PatientRecordsModule,
    ExpensesModule,
    BillingModule,
  ],
})
export class DoctorModule {}
