import { Module } from '@nestjs/common';
import { AvailableSlotsController } from './available-slots.controller';
import { AppointmentSlotsModule } from '../../doctor/appointment-slots/appointment-slots.module';

@Module({
  imports: [AppointmentSlotsModule],
  controllers: [AvailableSlotsController],
})
export class AvailableSlotsModule {}
