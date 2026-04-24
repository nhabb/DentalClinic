import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../shared/prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.users.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already in use');
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

    if (!user) {
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

      await this.prisma.patient_profiles.create({
        data: { user_id: created.id },
      });

      user = created;
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is disabled');
    }

    const token = this.jwtService.sign({
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
    });

    return { user, token };
  }

  async getMe(userId: number) {
    return this.prisma.users.findUnique({
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
        created_at: true,
      },
    });
  }
}
