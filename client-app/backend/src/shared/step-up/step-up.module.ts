import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ConfirmedAdminGuard } from './confirmed-admin.guard';
import { PasswordConfirmationService } from './password-confirmation.service';

/**
 * Step-up authentication: routes that destroy money records ask the admin to
 * type their password again (ConfirmedAdminGuard). Import this module where
 * such a controller lives and put @UseGuards(ConfirmedAdminGuard) on the route.
 */
@Module({
  imports: [AuditModule],
  providers: [PasswordConfirmationService, ConfirmedAdminGuard],
  exports: [PasswordConfirmationService, ConfirmedAdminGuard],
})
export class StepUpModule {}
