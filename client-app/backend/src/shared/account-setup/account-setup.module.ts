import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AccountSetupService } from './account-setup.service';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [AccountSetupService],
  exports: [AccountSetupService],
})
export class AccountSetupModule {}
