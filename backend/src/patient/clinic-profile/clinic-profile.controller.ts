import {
  Controller,
  Get,
  Patch,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SupabaseStorageService } from '../../shared/storage/supabase-storage.service';

const PROFILE_BUCKET = 'profile-photos';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Clinic Profile')
@Controller('clinic-profile')
export class ClinicProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Get clinic information (name, address, phone, opening hours, logo)',
  })
  async getClinicProfile() {
    const profile = await this.prisma.clinic_profile.findFirst();
    if (!profile) throw new NotFoundException('Clinic profile not found');
    return profile;
  }

  @Patch('logo')
  @ApiOperation({ summary: 'Upload or replace the clinic logo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async updateLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPEG, PNG, and WebP images are allowed',
      );
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('Image must be under 5 MB');
    }

    const clinic = await this.prisma.clinic_profile.findFirst();
    if (!clinic) throw new NotFoundException('Clinic profile not found');

    // Delete old logo if one exists
    if (clinic.logo_url) {
      const oldPath = this.extractPath(clinic.logo_url);
      if (oldPath)
        await this.storage.delete(PROFILE_BUCKET, oldPath).catch(() => null);
    }

    const ext = file.mimetype.split('/')[1];
    const storagePath = `clinic/logo.${ext}`;
    const publicUrl = await this.storage.upload(
      PROFILE_BUCKET,
      storagePath,
      file.buffer,
      file.mimetype,
    );

    return this.prisma.clinic_profile.update({
      where: { id: clinic.id },
      data: { logo_url: publicUrl },
    });
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
