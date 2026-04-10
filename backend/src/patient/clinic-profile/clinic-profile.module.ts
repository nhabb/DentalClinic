import { Module } from '@nestjs/common';
import { ClinicProfileController } from './clinic-profile.controller';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicProfileController],
})
export class ClinicProfileModule {}
