import { Module } from '@nestjs/common';
import { PatientRecordsViewController } from './patient-records-view.controller';
import { PatientRecordsModule } from '../../doctor/patient-records/patient-records.module';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [PatientRecordsModule, PatientsModule],
  controllers: [PatientRecordsViewController],
})
export class PatientRecordsViewModule {}
