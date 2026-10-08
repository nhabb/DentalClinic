import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateAdminDto } from './dto/admin.dto';

const adminSelect = {
  id: true,
  email: true,
  first_name: true,
  last_name: true,
  is_active: true,
  created_at: true,
} as const;

/** Platform admins: `superadmin` users with no organization. */
@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  list() {
    return this.prisma.users.findMany({
      where: { role: 'superadmin', organization_id: null },
      select: adminSelect,
      orderBy: { created_at: 'asc' },
    });
  }

  async create(dto: CreateAdminDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.users.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException(`A user with the email ${email} already exists`);
    }
    return this.prisma.users.create({
      data: {
        organization_id: null,
        email,
        first_name: dto.first_name.trim(),
        last_name: dto.last_name.trim(),
        role: 'superadmin',
        password_hash: await bcrypt.hash(dto.password, 10),
      },
      select: adminSelect,
    });
  }

  /** Deactivate (or reactivate) an admin; never the last active one, never yourself. */
  async setActive(actorId: bigint, id: bigint, isActive: boolean) {
    if (actorId === id && !isActive) throw new BadRequestException('You cannot deactivate your own account');
    const admin = await this.prisma.users.findFirst({
      where: { id, role: 'superadmin', organization_id: null },
    });
    if (!admin) throw new NotFoundException('Platform admin not found');
    if (!isActive) {
      const others = await this.prisma.users.count({
        where: { role: 'superadmin', organization_id: null, is_active: true, NOT: { id } },
      });
      if (others === 0) throw new BadRequestException('At least one active platform admin must remain');
    }
    const updated = await this.prisma.users.update({
      where: { id },
      data: { is_active: isActive, updated_at: new Date() },
      select: adminSelect,
    });
    this.auth.invalidate(id);
    return updated;
  }
}
