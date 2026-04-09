import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { NotificationsService } from '../../shared/notifications/notifications.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CancelAppointmentDto, UpdateAppointmentNotesDto } from './dto/update-appointment.dto';

const VALID_STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];

const appointmentInclude = {
  patient_profile: {
    select: {
      id: true,
      users: { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
    },
  },
  doctor: {
    select: { id: true, first_name: true, last_name: true, email: true },
  },
  slot: true,
};

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateAppointmentDto) {
    // Validate slot
    const slot = await this.prisma.appointment_slots.findUnique({
      where: { id: BigInt(dto.slot_id) },
      include: { doctor: { select: { id: true, first_name: true, last_name: true } } },
    });
    if (!slot) throw new NotFoundException('Appointment slot not found');
    if (slot.is_booked) throw new BadRequestException('This slot is already booked');

    // Validate patient profile
    const patient = await this.prisma.patient_profiles.findUnique({
      where: { id: BigInt(dto.patient_id) },
      include: { users: { select: { id: true, first_name: true, last_name: true } } },
    });
    if (!patient) throw new NotFoundException('Patient profile not found');

    // Create appointment + mark slot booked in a transaction
    const [appointment] = await this.prisma.$transaction([
      this.prisma.appointments.create({
        data: {
          patient_id: BigInt(dto.patient_id),
          doctor_id: slot.doctor_id,
          slot_id: slot.id,
          appointment_date: slot.slot_date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          status: 'scheduled',
          reason: dto.reason,
        },
        include: appointmentInclude,
      }),
      this.prisma.appointment_slots.update({
        where: { id: slot.id },
        data: { is_booked: true, updated_at: new Date() },
      }),
    ]);

    // Notify doctor
    await this.notifications.create({
      user_id: slot.doctor_id,
      type: 'appointment_booked',
      title: 'New Appointment Request',
      message: `${patient.users.first_name} ${patient.users.last_name} has requested an appointment on ${slot.slot_date.toISOString().split('T')[0]}.`,
    });

    return appointment;
  }

  async findAll(filters: {
    doctor_id?: number;
    patient_id?: number;
    status?: string;
    date?: string;
    page?: number;
    limit?: number;
  }) {
    const { doctor_id, patient_id, status, date, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (doctor_id) where.doctor_id = BigInt(doctor_id);
    if (patient_id) where.patient_id = BigInt(patient_id);
    if (status) where.status = status;
    if (date) {
      // Use a full-day range to avoid timezone/time-component mismatches on @db.Date fields
      where.appointment_date = {
        gte: new Date(`${date}T00:00:00.000Z`),
        lte: new Date(`${date}T23:59:59.999Z`),
      };
    }

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

  async findOne(id: bigint) {
    const appointment = await this.prisma.appointments.findUnique({
      where: { id },
      include: appointmentInclude,
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  async confirm(id: bigint) {
    const appointment = await this.findOne(id);
    if (appointment.status !== 'scheduled') {
      throw new BadRequestException(`Cannot confirm an appointment with status '${appointment.status}'`);
    }

    const updated = await this.prisma.appointments.update({
      where: { id },
      data: { status: 'confirmed', updated_at: new Date() },
      include: appointmentInclude,
    });

    // Notify patient
    await this.notifications.create({
      user_id: appointment.patient_profile.users.id,
      type: 'appointment_confirmed',
      title: 'Appointment Confirmed',
      message: `Your appointment on ${appointment.appointment_date.toISOString().split('T')[0]} has been confirmed by Dr. ${appointment.doctor.last_name}.`,
    });

    return updated;
  }

  async complete(id: bigint) {
    const appointment = await this.findOne(id);
    if (appointment.status !== 'confirmed') {
      throw new BadRequestException(`Cannot complete an appointment with status '${appointment.status}'`);
    }

    return this.prisma.appointments.update({
      where: { id },
      data: { status: 'completed', updated_at: new Date() },
      include: appointmentInclude,
    });
  }

  async cancel(id: bigint, dto: CancelAppointmentDto) {
    const appointment = await this.findOne(id);

    if (['completed', 'cancelled'].includes(appointment.status)) {
      throw new BadRequestException(`Cannot cancel an appointment with status '${appointment.status}'`);
    }

    const updated = await this.prisma.appointments.update({
      where: { id },
      data: {
        status: 'cancelled',
        notes: dto.reason
          ? `Cancelled: ${dto.reason}`
          : appointment.notes ?? undefined,
        updated_at: new Date(),
      },
      include: appointmentInclude,
    });

    // Free the slot back
    if (appointment.slot_id) {
      await this.prisma.appointment_slots.update({
        where: { id: appointment.slot_id },
        data: { is_booked: false, updated_at: new Date() },
      });
    }

    // Notify the other party
    const patientUserId = appointment.patient_profile.users.id;
    const doctorId = appointment.doctor.id;

    await this.notifications.create({
      user_id: patientUserId,
      type: 'appointment_cancelled',
      title: 'Appointment Cancelled',
      message: `Your appointment on ${appointment.appointment_date.toISOString().split('T')[0]} has been cancelled.`,
    });

    await this.notifications.create({
      user_id: doctorId,
      type: 'appointment_cancelled',
      title: 'Appointment Cancelled',
      message: `The appointment with ${appointment.patient_profile.users.first_name} ${appointment.patient_profile.users.last_name} on ${appointment.appointment_date.toISOString().split('T')[0]} has been cancelled.`,
    });

    return updated;
  }

  async updateNotes(id: bigint, dto: UpdateAppointmentNotesDto) {
    await this.findOne(id);
    return this.prisma.appointments.update({
      where: { id },
      data: {
        notes: dto.notes,
        reason: dto.reason,
        updated_at: new Date(),
      },
      include: appointmentInclude,
    });
  }
}
