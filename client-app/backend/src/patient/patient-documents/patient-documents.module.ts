import { Module } from '@nestjs/common';
import { PatientDocumentsService } from './patient-documents.service';
import { PatientDocumentsController } from './patient-documents.controller';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { StorageModule } from '../../shared/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [PatientDocumentsController],
  providers: [PatientDocumentsService],
  exports: [PatientDocumentsService],
})
export class PatientDocumentsModule {}
