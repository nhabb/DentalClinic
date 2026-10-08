import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { CaseLinksModule } from '../case-links/case-links.module';
import { LabsController } from './labs.controller';
import { LabsService } from './labs.service';
import { LabOrdersController } from './lab-orders.controller';
import { LabOrdersService } from './lab-orders.service';

/** Dental labs and the work sent to them. */
@Module({
  imports: [PrismaModule, CaseLinksModule],
  controllers: [LabsController, LabOrdersController],
  providers: [LabsService, LabOrdersService],
  exports: [LabOrdersService],
})
export class LabModule {}
