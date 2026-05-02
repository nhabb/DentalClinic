import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';

const PROFILE_BUCKET = 'profile-photos';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  async create(data: {
    email: string;
    first_name: string;
    last_name: string;
    phone?: string;
    role?: string;
  }) {
    const existing = await this.prisma.users.findUnique({
      where: { email: data.email },
    });
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
        avatar_url: true,
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
      select: {
        id: true,
        email: true,
        role: true,
        first_name: true,
        last_name: true,
      },
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

  async findStaff() {
    return this.prisma.users.findMany({
      where: { role: { in: ['doctor', 'secretary', 'admin', 'superadmin'] } },
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

  async remove(id: bigint) {
    await this.findById(id);
    await this.prisma.users.delete({ where: { id } });
    return { message: 'User deleted successfully' };
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

  async updateAvatar(id: bigint, file: Express.Multer.File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPEG, PNG, and WebP images are allowed',
      );
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('Image must be under 5 MB');
    }

    const user = await this.prisma.users.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // Delete old avatar if one exists
    if (user.avatar_url) {
      const oldPath = this.extractPath(user.avatar_url);
      if (oldPath)
        await this.storage.delete(PROFILE_BUCKET, oldPath).catch(() => null);
    }

    const ext = file.mimetype.split('/')[1];
    const storagePath = `users/${id}/${Date.now()}.${ext}`;
    const publicUrl = await this.storage.upload(
      PROFILE_BUCKET,
      storagePath,
      file.buffer,
      file.mimetype,
    );

    return this.prisma.users.update({
      where: { id },
      data: { avatar_url: publicUrl, updated_at: new Date() },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        avatar_url: true,
        updated_at: true,
      },
    });
  }

  async changePassword(id: bigint, dto: ChangePasswordDto) {
    const user = await this.prisma.users.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const isOAuthAccount = user.password_hash === 'oauth';

    if (!isOAuthAccount) {
      if (!dto.old_password)
        throw new BadRequestException('Old password is required');
      const valid = await bcrypt.compare(dto.old_password, user.password_hash);
      if (!valid) throw new BadRequestException('Old password is incorrect');
    }
    // OAuth accounts have no password — skip old-password check and just set the new one

    const password_hash = await bcrypt.hash(dto.new_password, 10);

    await this.prisma.users.update({
      where: { id },
      data: { password_hash, updated_at: new Date() },
    });

    return { message: 'Password updated successfully' };
  }

  private extractPath(publicUrl: string): string | null {
    try {
      const url = new URL(publicUrl);
      const parts = url.pathname.split('/object/public/');
      if (parts.length < 2) return null;
      const withBucket = parts[1];
      const slashIdx = withBucket.indexOf('/');
      return slashIdx === -1 ? null : withBucket.slice(slashIdx + 1);
    } catch {
      return null;
    }
  }
}
