import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    email: string;
    first_name: string;
    last_name: string;
    phone?: string;
    role?: string;
  }) {
    const existing = await this.prisma.users.findUnique({ where: { email: data.email } });
    if (existing) return existing;

    const password_hash = await bcrypt.hash(Math.random().toString(36), 10);

    const user = await this.prisma.users.create({
      data: {
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone || null,
        role: (data.role as any) || 'patient',
        password_hash,
        is_active: true,
      },
    });

    if (user.role === 'patient') {
      await this.prisma.patient_profiles.create({
        data: { user_id: user.id },
      });
    }

    return user;
  }

  async findById(id: bigint) {
    const user = await this.prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        date_of_birth: true,
        gender: true,
        address: true,
        role: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string) {
    const user = await this.prisma.users.findUnique({
      where: { email },
      select: { id: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAll(role?: string) {
    return this.prisma.users.findMany({
      where: role ? { role } : undefined,
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        role: true,
        is_active: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async update(id: bigint, dto: UpdateUserDto) {
    await this.findById(id);

    return this.prisma.users.update({
      where: { id },
      data: {
        ...dto,
        date_of_birth: dto.date_of_birth
          ? new Date(dto.date_of_birth)
          : undefined,
        updated_at: new Date(),
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        date_of_birth: true,
        gender: true,
        address: true,
        role: true,
        updated_at: true,
      },
    });
  }

  async changePassword(id: bigint, dto: ChangePasswordDto) {
    const user = await this.prisma.users.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.old_password, user.password_hash);
    if (!valid) throw new BadRequestException('Old password is incorrect');

    const password_hash = await bcrypt.hash(dto.new_password, 10);

    await this.prisma.users.update({
      where: { id },
      data: { password_hash, updated_at: new Date() },
    });

    return { message: 'Password updated successfully' };
  }
}
