import { Module } from '@nestjs/common';
import { ClinicProfileController } from './clinic-profile.controller';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { StorageModule } from '../../shared/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [ClinicProfileController],
})
export class ClinicProfileModule {}
