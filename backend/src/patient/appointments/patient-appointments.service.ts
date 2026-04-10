import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppointmentsService } from '../../doctor/appointments/appointments.service';
import { CancelAppointmentDto } from '../../doctor/appointments/dto/update-appointment.dto';

const appointmentInclude = {
  patient_profiles: {
    select: {
      id: true,
      users: { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
    },
  },
  users_appointments_doctor_idTousers: {
    select: { id: true, first_name: true, last_name: true, email: true },
  },
  appointment_slots: true,
};

@Injectable()
export class PatientAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  private async resolvePatientProfile(userId: number) {
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { user_id: BigInt(userId) },
    });
    if (!profile) throw new NotFoundException('Patient profile not found');
    return profile;
  }

  async getUpcoming(userId: number, page = 1, limit = 20) {
    const profile = await this.resolvePatientProfile(userId);
    const skip = (page - 1) * limit;
    const where = {
      patient_id: profile.id,
      status: { in: ['pending', 'scheduled', 'confirmed'] },
    };

    const [data, total] = await Promise.all([
      this.prisma.appointments.findMany({
        where,
        include: appointmentInclude,
        skip,
        take: limit,
        orderBy: [{ appointment_date: 'asc' }, { start_time: 'asc' }],
      }),
      this.prisma.appointments.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getHistory(userId: number, page = 1, limit = 20) {
    const profile = await this.resolvePatientProfile(userId);
    const skip = (page - 1) * limit;
    const where = {
      patient_id: profile.id,
      status: { in: ['completed', 'cancelled', 'no_show'] },
    };

    const [data, total] = await Promise.all([
      this.prisma.appointments.findMany({
        where,
        include: appointmentInclude,
        skip,
        take: limit,
        orderBy: [{ appointment_date: 'desc' }, { start_time: 'desc' }],
      }),
      this.prisma.appointments.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async cancel(userId: number, appointmentId: number, dto: CancelAppointmentDto) {
    const profile = await this.resolvePatientProfile(userId);
    const appointment = await this.appointmentsService.findOne(BigInt(appointmentId));

    if (appointment.patient_profiles.id.toString() !== profile.id.toString()) {
      throw new ForbiddenException('You can only cancel your own appointments');
    }

    return this.appointmentsService.cancel(BigInt(appointmentId), dto);
  }
}
