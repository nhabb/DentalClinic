import { Module } from '@nestjs/common';
import { PrismaModule } from './shared/prisma/prisma.module';
import { UsersModule } from './shared/users/users.module';
import { AuthModule } from './auth/auth.module';
import { DoctorModule } from './doctor/doctor.module';
import { PatientModule } from './patient/patient.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    AuthModule,
    DoctorModule,
    PatientModule,
  ],
})
export class AppModule {}
