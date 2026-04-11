import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
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

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.users.create({
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

      await tx.patient_profiles.create({
        data: { user_id: newUser.id },
      });

      return newUser;
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
