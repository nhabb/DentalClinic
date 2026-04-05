import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSlotDto } from './dto/create-slot.dto';

@Injectable()
export class AppointmentSlotsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildEndTime(startTime: string): string {
    const [h, m] = startTime.split(':').map(Number);
    const end = new Date(0, 0, 0, h + 1, m);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  }

  private toTimeDate(timeStr: string): Date {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(0);
    d.setUTCHours(h, m, 0, 0);
    return d;
  }

  async create(dto: CreateSlotDto) {
    const doctor = await this.prisma.users.findFirst({
      where: { id: BigInt(dto.doctor_id), role: 'admin' },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const slotDate = new Date(dto.slot_date);
    const startTime = this.toTimeDate(dto.start_time);
    const endTime = this.toTimeDate(this.buildEndTime(dto.start_time));

    // Prevent duplicate slot for same doctor/date/time
    const existing = await this.prisma.appointment_slots.findFirst({
      where: {
        doctor_id: BigInt(dto.doctor_id),
        slot_date: slotDate,
        start_time: startTime,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'A slot already exists for this doctor at this date and time',
      );
    }

    return this.prisma.appointment_slots.create({
      data: {
        doctor_id: BigInt(dto.doctor_id),
        slot_date: slotDate,
        start_time: startTime,
        end_time: endTime,
        is_booked: false,
      },
      include: {
        doctor: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });
  }

  async findAll(filters: {
    doctor_id?: number;
    date?: string;
    available_only?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { doctor_id, date, available_only, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (doctor_id) where.doctor_id = BigInt(doctor_id);
    if (date) where.slot_date = new Date(date);
    if (available_only) where.is_booked = false;

    const [data, total] = await Promise.all([
      this.prisma.appointment_slots.findMany({
        where,
        include: {
          doctor: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
        skip,
        take: limit,
        orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
      }),
      this.prisma.appointment_slots.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: bigint) {
    const slot = await this.prisma.appointment_slots.findUnique({
      where: { id },
      include: {
        doctor: { select: { id: true, first_name: true, last_name: true } },
      },
    });
    if (!slot) throw new NotFoundException('Appointment slot not found');
    return slot;
  }

  async remove(id: bigint) {
    const slot = await this.findOne(id);
    if (slot.is_booked) {
      throw new BadRequestException('Cannot delete a slot that is already booked');
    }
    await this.prisma.appointment_slots.delete({ where: { id } });
    return { message: 'Slot deleted successfully' };
  }
}
