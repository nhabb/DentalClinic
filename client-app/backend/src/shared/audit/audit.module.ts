import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Audit trail of sensitive actions (see AuditService). */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
