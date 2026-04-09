import { Module } from '@nestjs/common';
import { PatientDocumentsService } from './patient-documents.service';
import { PatientDocumentsController } from './patient-documents.controller';
import { SupabaseStorageService } from './supabase-storage.service';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PatientDocumentsController],
  providers: [PatientDocumentsService, SupabaseStorageService],
  exports: [PatientDocumentsService],
})
export class PatientDocumentsModule {}
