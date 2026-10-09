import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  searchWithFallback,
  textSearchTiers,
} from '../../shared/common/text-search';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';

/** The clinic's directory of dental laboratories. */
@Injectable()
export class LabsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    search?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { search, active, page = 1, limit = 20 } = filters;
    const base = active !== undefined ? { is_active: active } : {};
    // Name search loosens word by word when the phrase matches nothing
    // (see text-search.ts); meta.searchTier reports which tier matched.
    const { rows, total, searchTier } = await searchWithFallback(
      textSearchTiers(search, ['name']),
      async (match) => {
        const where = { ...base, ...match };
        const [rows, total] = await Promise.all([
          this.prisma.dental_labs.findMany({
            where,
            orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
            skip: (page - 1) * limit,
            take: limit,
          }),
          this.prisma.dental_labs.count({ where }),
        ]);
        return { rows, total };
      },
    );
    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        searchTier,
      },
    };
  }

  async findOne(id: bigint) {
    const lab = await this.prisma.dental_labs.findUnique({
      where: { id },
      include: { _count: { select: { lab_orders: true } } },
    });
    if (!lab) throw new NotFoundException('Lab not found');
    return lab;
  }

  create(dto: CreateLabDto) {
    return this.prisma.dental_labs.create({ data: dto });
  }

  async update(id: bigint, dto: UpdateLabDto) {
    await this.findOne(id);
    return this.prisma.dental_labs.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  /** A lab with orders is part of the patients' history: deactivate instead. */
  async remove(id: bigint) {
    const lab = await this.findOne(id);
    if (lab._count.lab_orders > 0) {
      throw new ConflictException(
        'This lab has orders on record; mark it inactive instead of deleting',
      );
    }
    await this.prisma.dental_labs.delete({ where: { id } });
    return { message: 'Lab deleted' };
  }

  /** For lab orders: the lab must exist here and be active. */
  async assertActive(id: bigint): Promise<void> {
    const lab = await this.prisma.dental_labs.findUnique({
      where: { id },
      select: { is_active: true },
    });
    if (!lab) throw new NotFoundException('Lab not found');
    if (!lab.is_active)
      throw new ConflictException('This lab is marked inactive');
  }
}
