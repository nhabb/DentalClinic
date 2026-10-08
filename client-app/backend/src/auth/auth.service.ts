import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../shared/prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { AccountSetupService } from '../shared/account-setup/account-setup.service';
import { currentTenant, runAsSystem } from '../shared/tenant/tenant-context';
import { AppJwtPayload } from '../shared/common/app-jwt';

/** Fields the JWT needs to carry so later requests know their tenant. */
interface TokenUser {
  id: bigint;
  email: string | null;
  role: string;
  organization_id: bigint | null;
  branch_id: bigint | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly accountSetup: AccountSetupService,
  ) {}

  /**
   * Our JWT carries the tenant (org_id) and home branch (branch_id) so every
   * later request can be scoped without a database round trip. Platform
   * superadmins have org_id null.
   */
  private sign(user: TokenUser): string {
    const payload: AppJwtPayload = {
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
      org_id: user.organization_id?.toString() ?? null,
      branch_id: user.branch_id?.toString() ?? null,
    };
    return this.jwtService.sign(payload);
  }

  /**
   * Organization for a brand-new self-registered account: whatever the request
   * resolved to (X-Organization header, host subdomain or DEFAULT_ORGANIZATION_SLUG).
   */
  private signupOrganizationId(): bigint {
    const { organizationId } = currentTenant();
    if (organizationId === null) {
      throw new BadRequestException(
        'No clinic selected. Open the clinic’s own address or send the X-Organization header to sign up.',
      );
    }
    return organizationId;
  }

  /** Check a password setup link before showing the form. */
  async validateSetupToken(token: string) {
    // Token lookups must see every tenant: the link does not say which clinic sent it.
    const user = await runAsSystem(() => this.accountSetup.findValid(token));
    if (!user) return { valid: false };
    return { valid: true, first_name: user.first_name, email: user.email };
  }

  /** Complete a password setup link: sets the password and burns the token. */
  async setPassword(dto: SetPasswordDto) {
    const user = await runAsSystem(() =>
      this.accountSetup.consume(dto.token, dto.password),
    );
    return { message: 'Password set. You can now log in.', email: user.email };
  }

  async signup(dto: SignupDto) {
    const organization_id = this.signupOrganizationId();

    // Email addresses are unique across all tenants, so check globally.
    const existing = await runAsSystem(() =>
      this.prisma.users.findUnique({ where: { email: dto.email } }),
    );
    if (existing) {
      throw new ConflictException(
        existing.must_set_password
          ? 'This email is already registered by the clinic. Use the password setup link you were sent, or ask the clinic to resend it.'
          : 'Email already in use',
      );
    }

    const password_hash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.users.create({
      data: {
        organization_id,
        email: dto.email,
        password_hash,
        first_name: dto.first_name,
        last_name: dto.last_name,
        phone: dto.phone,
        date_of_birth: dto.date_of_birth
          ? new Date(dto.date_of_birth)
          : undefined,
        gender: dto.gender,
        address: dto.address,
        role: 'patient',
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        organization_id: true,
        branch_id: true,
        created_at: true,
      },
    });

    // Create profile separately — avoids interactive-transaction timeout on remote DB
    await this.prisma.patient_profiles.create({
      data: { user_id: user.id, organization_id },
    });

    const token = this.sign(user);

    return { user, token };
  }

  async login(dto: LoginDto) {
    // Login has no tenant yet: find the account across all organizations.
    const user = await runAsSystem(() =>
      this.prisma.users.findUnique({ where: { email: dto.email } }),
    );
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.sign(user);

    const { password_hash, ...userWithoutPassword } = user;

    return { user: userWithoutPassword, token };
  }

  async provision(accessToken: string) {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Verify the Supabase token and get the user's profile data
    const {
      data: { user: sbUser },
      error,
    } = await supabase.auth.getUser(accessToken);
    if (error || !sbUser?.email) {
      throw new UnauthorizedException('Invalid Supabase token');
    }

    const email = sbUser.email;
    const meta = sbUser.user_metadata ?? {};

    // Parse name from Google profile metadata
    const fullName: string = meta.full_name ?? meta.name ?? '';
    const parts = fullName.trim().split(' ');
    const firstName = meta.given_name ?? parts[0] ?? email.split('@')[0];
    const lastName = meta.family_name ?? parts.slice(1).join(' ') ?? '';

    const select = {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      is_active: true,
      organization_id: true,
      branch_id: true,
    };

    // Find the user across all tenants (OAuth sign-in carries no tenant yet)
    let user = await runAsSystem(() =>
      this.prisma.users.findUnique({ where: { email }, select }),
    );
    let is_new_user = false;

    if (!user) {
      const organization_id = this.signupOrganizationId();
      try {
        // New OAuth user — create as patient with a placeholder password hash
        const created = await this.prisma.users.create({
          data: {
            organization_id,
            email,
            password_hash: 'oauth',
            first_name: firstName,
            last_name: lastName,
            role: 'patient',
          },
          select,
        });

        // Create patient profile, ignoring a duplicate if a race already made one
        await this.prisma.patient_profiles.upsert({
          where: { user_id: created.id },
          create: { user_id: created.id, organization_id },
          update: {},
        });

        user = created;
        is_new_user = true;
      } catch (err: any) {
        // Race condition: a concurrent request already created the user between
        // our findUnique and create — just look them up and treat as existing
        if (err?.code === 'P2002') {
          user = await runAsSystem(() =>
            this.prisma.users.findUnique({ where: { email }, select }),
          );
          if (!user) throw err;
        } else {
          throw err;
        }
      }
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is disabled');
    }

    const token = this.sign(user);

    return { user, token, is_new_user };
  }

  /** The signed-in user; `permissions` lets the UI hide what the role cannot do. */
  async getMe(userId: number, permissions: readonly string[] = []) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        date_of_birth: true,
        gender: true,
        address: true,
        role: true,
        organization_id: true,
        branch_id: true,
        avatar_url: true,
        created_at: true,
        password_hash: true,
        organization: {
          select: { id: true, name: true, slug: true, logo_url: true },
        },
        branch: { select: { id: true, name: true, city: true } },
      },
    });
    if (!user) return null;
    const { password_hash, ...rest } = user;
    return { ...rest, is_oauth: password_hash === 'oauth', permissions };
  }
}
