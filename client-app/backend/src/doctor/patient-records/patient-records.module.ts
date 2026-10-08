import { Module } from '@nestjs/common';
import { PatientRecordsService } from './patient-records.service';
import { PatientRecordsController } from './patient-records.controller';
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PatientRecordsController],
  providers: [PatientRecordsService],
  exports: [PatientRecordsService], //why we export the service not the controller? Because other modules might need to use the business logic defined in the PatientRecordsService, such as creating, retrieving, updating, and deleting patient records. By exporting the service, we allow other modules to import it and use its functionality without needing to import the entire PatientRecordsModule or its controller. This keeps our module dependencies clean and focused, allowing other modules to use the patient records functionality without being tightly coupled to the PatientRecordsModule itself. Controllers are typically not exported because they are meant to handle HTTP requests within their own module and are not intended to be used directly by other modules.
})
export class PatientRecordsModule {}
