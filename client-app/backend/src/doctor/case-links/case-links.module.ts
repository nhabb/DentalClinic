import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { CaseLinksService } from './case-links.service';

/** The "this patient, this visit, this record belong together" rule. */
@Module({
  imports: [PrismaModule],
  providers: [CaseLinksService],
  exports: [CaseLinksService],
})
export class CaseLinksModule {}
