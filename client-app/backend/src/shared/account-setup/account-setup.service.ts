import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const TOKEN_TTL_HOURS = Number(process.env.PASSWORD_SETUP_TTL_HOURS ?? 72);
const CLINIC_NAME = process.env.CLINIC_NAME ?? 'BrightSmile Dental Clinic';

export interface InviteResult {
  link: string;
  emailed: boolean;
  email: string | null;
  expires_at: Date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * One-time "set your password" links for accounts created by clinic staff.
 * Only a sha256 hash of the token is stored; the raw token lives in the link.
 */
@Injectable()
export class AccountSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  buildLink(token: string): string {
    const base = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
    return `${base}/set-password?token=${encodeURIComponent(token)}`;
  }

  /** Create a fresh token for the user, replacing any previous one. */
  async issue(
    userId: bigint,
  ): Promise<{ token: string; link: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
    await this.prisma.users.update({
      where: { id: userId },
      data: {
        password_setup_token_hash: this.hash(token),
        password_setup_expires_at: expiresAt,
        password_setup_sent_at: new Date(),
        must_set_password: true,
        updated_at: new Date(),
      },
    });
    return { token, link: this.buildLink(token), expiresAt };
  }

  /** Issue a token and email the link if the user has an email address. */
  async issueAndSend(user: {
    id: bigint;
    email: string | null;
    first_name: string;
  }): Promise<InviteResult> {
    const { link, expiresAt } = await this.issue(user.id);
    let emailed = false;
    if (user.email) {
      const name = escapeHtml(user.first_name);
      const clinic = escapeHtml(CLINIC_NAME);
      emailed = await this.mail.send({
        to: user.email,
        subject: `Set up your ${CLINIC_NAME} patient account`,
        text:
          `Hello ${user.first_name},\n\n` +
          `${CLINIC_NAME} created a patient account for you. Use the link below to choose your password:\n\n` +
          `${link}\n\n` +
          `This link expires in ${TOKEN_TTL_HOURS} hours. If you did not expect this email you can ignore it.`,
        html:
          `<p>Hello ${name},</p>` +
          `<p>${clinic} created a patient account for you. Click the button below to choose your password.</p>` +
          `<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">Set my password</a></p>` +
          `<p style="color:#6b7280;font-size:13px">Or copy this link: <a href="${link}">${link}</a><br/>` +
          `This link expires in ${TOKEN_TTL_HOURS} hours. If you did not expect this email you can ignore it.</p>`,
      });
    }
    return { link, emailed, email: user.email, expires_at: expiresAt };
  }

  /** Returns the user for a valid, unexpired token, or null. */
  async findValid(token: string) {
    if (!token || token.length < 20 || token.length > 200) return null;
    const user = await this.prisma.users.findFirst({
      where: { password_setup_token_hash: this.hash(token) },
    });
    if (!user || !user.is_active) return null;
    if (
      !user.password_setup_expires_at ||
      user.password_setup_expires_at.getTime() < Date.now()
    ) {
      return null;
    }
    return user;
  }

  /** Set the password for the token's user and burn the token. */
  async consume(token: string, password: string) {
    const user = await this.findValid(token);
    if (!user) {
      throw new BadRequestException(
        'This link is invalid or has expired. Ask the clinic to send you a new one.',
      );
    }
    const password_hash = await bcrypt.hash(password, 10);
    return this.prisma.users.update({
      where: { id: user.id },
      data: {
        password_hash,
        must_set_password: false,
        password_setup_token_hash: null,
        password_setup_expires_at: null,
        updated_at: new Date(),
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
      },
    });
  }
}
