import { Module } from '@nestjs/common';
import { PatientAppointmentsController } from './patient-appointments.controller';
import { PatientAppointmentsService } from './patient-appointments.service';
import { AppointmentsModule } from '../../doctor/appointments/appointments.module';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule, AppointmentsModule],
  controllers: [PatientAppointmentsController],
  providers: [PatientAppointmentsService],
})
export class PatientAppointmentsModule {}
