import { Module } from '@nestjs/common';
import { AppointmentsModule } from './appointments/appointments.module';
import { AppointmentSlotsModule } from './appointment-slots/appointment-slots.module';
import { InventoryModule } from './inventory/inventory.module';
import { PatientRecordsModule } from './patient-records/patient-records.module';

/**
 * Doctor/Admin panel modules.
 * Dev scope: appointments, slots, inventory, patient records.
 */
@Module({
  imports: [
    AppointmentsModule,
    AppointmentSlotsModule,
    InventoryModule,
    PatientRecordsModule,
  ],
})
export class DoctorModule {}
