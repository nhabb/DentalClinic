import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../shared/prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { AccountSetupService } from '../shared/account-setup/account-setup.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly accountSetup: AccountSetupService,
  ) {}

  /** Check a password setup link before showing the form. */
  async validateSetupToken(token: string) {
    const user = await this.accountSetup.findValid(token);
    if (!user) return { valid: false };
    return { valid: true, first_name: user.first_name, email: user.email };
  }

  /** Complete a password setup link: sets the password and burns the token. */
  async setPassword(dto: SetPasswordDto) {
    const user = await this.accountSetup.consume(dto.token, dto.password);
    return { message: 'Password set. You can now log in.', email: user.email };
  }

  async signup(dto: SignupDto) {
    const existing = await this.prisma.users.findUnique({ where: { email: dto.email } });
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
        email: dto.email,
        password_hash,
        first_name: dto.first_name,
        last_name: dto.last_name,
        phone: dto.phone,
        date_of_birth: dto.date_of_birth ? new Date(dto.date_of_birth) : undefined,
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
        created_at: true,
      },
    });

    // Create profile separately — avoids interactive-transaction timeout on remote DB
    await this.prisma.patient_profiles.create({
      data: { user_id: user.id },
    });

    const token = this.jwtService.sign({ sub: user.id.toString(), email: user.email, role: user.role });

    return { user, token };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.users.findUnique({ where: { email: dto.email } });
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwtService.sign({ sub: user.id.toString(), email: user.email, role: user.role });

    const { password_hash, ...userWithoutPassword } = user;

    return { user: userWithoutPassword, token };
  }

  async provision(accessToken: string) {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Verify the Supabase token and get the user's profile data
    const { data: { user: sbUser }, error } = await supabase.auth.getUser(accessToken);
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
    };

    // Find or create the user
    let user = await this.prisma.users.findUnique({ where: { email }, select });
    let is_new_user = false;

    if (!user) {
      try {
        // New OAuth user — create as patient with a placeholder password hash
        const created = await this.prisma.users.create({
          data: {
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
          create: { user_id: created.id },
          update: {},
        });

        user = created;
        is_new_user = true;
      } catch (err: any) {
        // Race condition: a concurrent request already created the user between
        // our findUnique and create — just look them up and treat as existing
        if (err?.code === 'P2002') {
          user = await this.prisma.users.findUnique({ where: { email }, select });
          if (!user) throw err;
        } else {
          throw err;
        }
      }
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is disabled');
    }

    const token = this.jwtService.sign({
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
    });

    return { user, token, is_new_user };
  }

  async getMe(userId: number) {
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
        avatar_url: true,
        created_at: true,
        password_hash: true,
      },
    });
    if (!user) return null;
    const { password_hash, ...rest } = user;
    return { ...rest, is_oauth: password_hash === 'oauth' };
  }
}
