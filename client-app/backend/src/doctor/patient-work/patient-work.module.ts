import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { PatientWorkController } from './patient-work.controller';
import { PatientWorkService } from './patient-work.service';

@Module({
  imports: [PrismaModule],
  controllers: [PatientWorkController],
  providers: [PatientWorkService],
  exports: [PatientWorkService],
})
export class PatientWorkModule {}
