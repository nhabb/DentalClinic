import { Module } from '@nestjs/common';
import { AppointmentSlotsService } from './appointment-slots.service';
import { AppointmentSlotsController } from './appointment-slots.controller';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppointmentSlotsController],
  providers: [AppointmentSlotsService],
  exports: [AppointmentSlotsService],
})
export class AppointmentSlotsModule {}
