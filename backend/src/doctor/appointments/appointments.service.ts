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
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private toTimeDate(timeStr: string): Date {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(0);
    d.setUTCHours(h, m, 0, 0);
    return d;
  }

  async create(dto: CreateAppointmentDto) {
    let slot: any;

    if (dto.slot_id) {
      // ── Slot-based booking ──────────────────────────────────────
      slot = await this.prisma.appointment_slots.findUnique({
        where: { id: BigInt(dto.slot_id) },
        include: { users: { select: { id: true, first_name: true, last_name: true } } },
      });
      if (!slot) throw new NotFoundException('Appointment slot not found');
      if (slot.is_booked) throw new BadRequestException('This slot is already booked');
    } else {
      // ── Direct booking (no pre-existing slot) ───────────────────
      if (!dto.doctor_id || !dto.appointment_date || !dto.start_time || !dto.end_time) {
        throw new BadRequestException(
          'Provide either slot_id or doctor_id + appointment_date + start_time + end_time',
        );
      }
      const doctor = await this.prisma.users.findFirst({
        where: { id: BigInt(dto.doctor_id), role: { in: ['admin', 'doctor'] } },
      });
      if (!doctor) throw new NotFoundException('Doctor not found');

      const slotDate = new Date(dto.appointment_date);
      const startTime = this.toTimeDate(dto.start_time);
      const endTime = this.toTimeDate(dto.end_time);

      if (startTime >= endTime) {
        throw new BadRequestException('end_time must be after start_time');
      }

      // Reuse an existing free slot at that time, or create one on-the-fly
      const existing = await this.prisma.appointment_slots.findFirst({
        where: { doctor_id: BigInt(dto.doctor_id), slot_date: slotDate, start_time: startTime, is_booked: false },
        include: { users: { select: { id: true, first_name: true, last_name: true } } },
      });

      if (existing) {
        slot = existing;
      } else {
        const conflict = await this.prisma.appointment_slots.findFirst({
          where: { doctor_id: BigInt(dto.doctor_id), slot_date: slotDate, start_time: startTime, is_booked: true },
        });
        if (conflict) throw new BadRequestException('This time slot is already booked for this doctor');

        slot = await this.prisma.appointment_slots.create({
          data: {
            doctor_id: BigInt(dto.doctor_id),
            slot_date: slotDate,
            start_time: startTime,
            end_time: endTime,
            is_booked: false,
          },
          include: { users: { select: { id: true, first_name: true, last_name: true } } },
        });
      }
    }

    // Validate that the slot is long enough for the requested procedure
    if (dto.duration_minutes) {
      const slotMinutes = Math.round(
        (new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime()) / 60000,
      );
      if (slotMinutes < dto.duration_minutes) {
        throw new BadRequestException(
          `This slot is only ${slotMinutes} min but the selected procedure requires ${dto.duration_minutes} min.`,
        );
      }
    }

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
          status: dto.auto_confirm ? 'confirmed' : 'scheduled',
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
      user_id: appointment.patient_profiles.users.id,
      type: 'appointment_confirmed',
      title: 'Appointment Confirmed',
      message: `Your appointment on ${appointment.appointment_date.toISOString().split('T')[0]} has been confirmed by Dr. ${appointment.users_appointments_doctor_idTousers.last_name}.`,
    });

    return updated;
  }

  async complete(id: bigint) {
    const appointment = await this.findOne(id);
    if (!['scheduled', 'confirmed'].includes(appointment.status)) {
      throw new BadRequestException(`Cannot complete an appointment with status '${appointment.status}'`);
    }

    const updated = await this.prisma.appointments.update({
      where: { id },
      data: { status: 'completed', updated_at: new Date() },
      include: appointmentInclude,
    });

    await this.notifications.create({
      user_id: appointment.patient_profiles.users.id,
      type: 'appointment_completed',
      title: 'Appointment Completed',
      message: `Your appointment on ${appointment.appointment_date.toISOString().split('T')[0]} has been marked as completed.`,
    });

    return updated;
  }

  async noShow(id: bigint) {
    const appointment = await this.findOne(id);
    if (!['scheduled', 'confirmed'].includes(appointment.status)) {
      throw new BadRequestException(`Cannot mark an appointment as no-show with status '${appointment.status}'`);
    }

    const updated = await this.prisma.appointments.update({
      where: { id },
      data: { status: 'no_show', updated_at: new Date() },
      include: appointmentInclude,
    });

    await this.notifications.create({
      user_id: appointment.patient_profiles.users.id,
      type: 'appointment_no_show',
      title: 'Missed Appointment',
      message: `You missed your appointment on ${appointment.appointment_date.toISOString().split('T')[0]}. Please contact us to reschedule.`,
    });

    return updated;
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
    const patientUserId = appointment.patient_profiles.users.id;
    const doctorId = appointment.users_appointments_doctor_idTousers.id;

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
      message: `The appointment with ${appointment.patient_profiles.users.first_name} ${appointment.patient_profiles.users.last_name} on ${appointment.appointment_date.toISOString().split('T')[0]} has been cancelled.`,
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
