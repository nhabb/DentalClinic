import { Module } from '@nestjs/common';
import { PatientRecordsService } from './patient-records.service';
import { PatientRecordsController } from './patient-records.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PatientRecordsController],
  providers: [PatientRecordsService],
  exports: [PatientRecordsService],
})
export class PatientRecordsModule {}
