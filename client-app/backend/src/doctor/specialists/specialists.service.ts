import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateSpecialistDto } from './dto/create-specialist.dto';
import { UpdateSpecialistDto } from './dto/update-specialist.dto';

/** The clinic's directory of outside doctors it asks for help. */
@Injectable()
export class SpecialistsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    search?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { search, active, page = 1, limit = 20 } = filters;
    const where = {
      ...(active !== undefined ? { is_active: active } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { specialty: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.specialists.findMany({
        where,
        orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.specialists.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: bigint) {
    const specialist = await this.prisma.specialists.findUnique({
      where: { id },
      include: { _count: { select: { consultations: true } } },
    });
    if (!specialist) throw new NotFoundException('Specialist not found');
    return specialist;
  }

  create(dto: CreateSpecialistDto) {
    return this.prisma.specialists.create({ data: dto });
  }

  async update(id: bigint, dto: UpdateSpecialistDto) {
    await this.findOne(id);
    return this.prisma.specialists.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  /** A specialist with consultations is part of the patients' history: deactivate instead. */
  async remove(id: bigint) {
    const specialist = await this.findOne(id);
    if (specialist._count.consultations > 0) {
      throw new ConflictException(
        'This specialist has consultations on record; mark them inactive instead of deleting',
      );
    }
    await this.prisma.specialists.delete({ where: { id } });
    return { message: 'Specialist deleted' };
  }

  /** For consultations: the specialist must exist here and be active. */
  async assertActive(id: bigint): Promise<void> {
    const specialist = await this.prisma.specialists.findUnique({
      where: { id },
      select: { is_active: true },
    });
    if (!specialist) throw new NotFoundException('Specialist not found');
    if (!specialist.is_active) {
      throw new ConflictException('This specialist is marked inactive');
    }
  }
}
