import { Controller, Get, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import { PrismaService } from '../../shared/prisma/prisma.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Patient — Clinic Profile')
@Controller('patient/clinic-profile')
export class ClinicProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Get clinic information (name, address, phone, opening hours)' })
  async getClinicProfile() {
    const profile = await this.prisma.clinic_profile.findFirst();
    if (!profile) throw new NotFoundException('Clinic profile not found');
    return profile;
  }
}
