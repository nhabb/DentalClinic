import { Module } from '@nestjs/common';
import { AppointmentsModule } from './appointments/appointments.module';
import { AppointmentSlotsModule } from './appointment-slots/appointment-slots.module';
import { InventoryModule } from './inventory/inventory.module';
import { PatientRecordsModule } from './patient-records/patient-records.module';
import { PaymentsModule } from './payments/payments.module';
import { ExpensesModule } from './expenses/expenses.module';

/**
 * Doctor/Admin panel modules.
 * Dev scope: appointments, slots, inventory, patient records, payments, expenses.
 */
@Module({
  imports: [
    AppointmentsModule,
    AppointmentSlotsModule,
    InventoryModule,
    PatientRecordsModule,
    PaymentsModule,
    ExpensesModule,
  ],
})
export class DoctorModule {}
