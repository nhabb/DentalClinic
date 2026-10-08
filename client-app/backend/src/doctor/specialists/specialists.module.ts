import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { CaseLinksModule } from '../case-links/case-links.module';
import { SpecialistsController } from './specialists.controller';
import { SpecialistsService } from './specialists.service';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';

/** Outside specialists and the cases they are asked to help on. */
@Module({
  imports: [PrismaModule, CaseLinksModule],
  controllers: [SpecialistsController, ConsultationsController],
  providers: [SpecialistsService, ConsultationsService],
  exports: [ConsultationsService],
})
export class SpecialistsModule {}
