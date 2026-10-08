import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Thin SMTP wrapper. Configure with SMTP_HOST / SMTP_PORT / SMTP_SECURE /
 * SMTP_USER / SMTP_PASS / MAIL_FROM. When SMTP_HOST is unset (local dev),
 * messages are written to the server log instead of being sent and `send`
 * resolves to false so callers can fall back (e.g. show the link to staff).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor() {
    const host = process.env.SMTP_HOST;
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    } else {
      this.transporter = null;
      this.logger.warn(
        'SMTP_HOST is not set: emails will be logged to the console, not sent',
      );
    }
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Returns true when the message was handed to the SMTP server. */
  async send(message: MailMessage): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(
        `[email not sent - SMTP not configured]\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
      );
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
        ...message,
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${message.to}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
