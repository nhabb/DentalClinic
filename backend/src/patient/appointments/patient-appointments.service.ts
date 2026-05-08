import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppointmentsService } from '../../doctor/appointments/appointments.service';
import { CancelAppointmentDto } from '../../doctor/appointments/dto/update-appointment.dto';

const appointmentInclude = {
  users_appointments_doctor_idTousers: {
    select: { id: true, first_name: true, last_name: true },
  },
};

@Injectable()
export class PatientAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  private async getPatientProfileId(userId: number): Promise<bigint> {
    const profile = await this.prisma.patient_profiles.findUnique({
      where: { user_id: BigInt(userId) },
      select: { id: true },
    });
    if (!profile) throw new ForbiddenException('Patient profile not found');
    return profile.id;
  }

  async getUpcoming(userId: number, page = 1, limit?: number) {
    const patientId = await this.getPatientProfileId(userId);
    const skip = limit ? (page - 1) * limit : 0;
    const where = {
      patient_id: patientId,
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
      meta: { total, page, limit, totalPages: limit ? Math.ceil(total / limit) : 1 },
    };
  }

  async getHistory(userId: number, page = 1, limit?: number) {
    const patientId = await this.getPatientProfileId(userId);
    const skip = limit ? (page - 1) * limit : 0;
    const where = {
      patient_id: patientId,
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
      meta: { total, page, limit, totalPages: limit ? Math.ceil(total / limit) : 1 },
    };
  }

  async cancel(
    userId: number,
    appointmentId: number,
    dto: CancelAppointmentDto,
  ) {
    const patientId = await this.getPatientProfileId(userId);
    const appointment = await this.appointmentsService.findOne(
      BigInt(appointmentId),
    );

    if (appointment.patient_profiles.id.toString() !== patientId.toString()) {
      throw new ForbiddenException('You can only cancel your own appointments');
    }

    return this.appointmentsService.cancel(BigInt(appointmentId), dto);
  }
}
