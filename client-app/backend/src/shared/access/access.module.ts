import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessControlService } from './access-control.service';

/** Ownership checks shared by every controller (see AccessControlService). */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessModule {}
