import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../shared/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'changeme',
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    const select = {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      phone: true,
      role: true,
      is_active: true,
    };

    // Backend-issued JWTs have an integer sub; Supabase OAuth JWTs have a UUID sub.
    const numericId = parseInt(payload.sub, 10);
    const user = !isNaN(numericId)
      ? await this.prisma.users.findUnique({ where: { id: numericId }, select })
      : await this.prisma.users.findUnique({ where: { email: payload.email }, select });

    if (!user || !user.is_active) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
