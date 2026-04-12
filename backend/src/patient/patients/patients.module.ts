import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { StorageModule } from '../../shared/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
