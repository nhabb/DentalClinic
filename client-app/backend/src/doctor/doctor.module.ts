import { Module } from '@nestjs/common';
import { AppointmentsModule } from './appointments/appointments.module';
import { AppointmentSlotsModule } from './appointment-slots/appointment-slots.module';
import { InventoryModule } from './inventory/inventory.module';
import { PatientRecordsModule } from './patient-records/patient-records.module';
import { ExpensesModule } from './expenses/expenses.module';
import { BillingModule } from './billing/billing.module';
import { PatientWorkModule } from './patient-work/patient-work.module';
import { SpecialistsModule } from './specialists/specialists.module';
import { LabModule } from './lab/lab.module';

/**
 * Doctor/Admin panel modules.
 * Dev scope: appointments, slots, inventory, patient records, payments, expenses, billing,
 * dental chart work, outside specialists, lab work.
 */
@Module({
  imports: [
    AppointmentsModule,
    AppointmentSlotsModule,
    InventoryModule,
    PatientRecordsModule,
    ExpensesModule,
    BillingModule,
    PatientWorkModule,
    SpecialistsModule,
    LabModule,
  ],
})
export class DoctorModule {}
