import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { signPlatformToken } from './platform-token';

/** A platform admin: a `superadmin` user that belongs to no organization. */
export interface PlatformUser {
  id: bigint;
  email: string | null;
  first_name: string;
  last_name: string;
}

const CACHE_TTL_MS = 30_000;

@Injectable()
export class AuthService {
  private readonly cache = new Map<string, { user: PlatformUser | null; expires: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.users.findUnique({ where: { email: email.toLowerCase() } });
    const isPlatformAdmin = user && user.role === 'superadmin' && user.organization_id === null;
    if (!user || !isPlatformAdmin || !user.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const { id, first_name, last_name } = user;
    return { token: signPlatformToken(user), user: { id, email: user.email, first_name, last_name } };
  }

  /** The admin behind a token, or null if deleted, deactivated or demoted. */
  async activeAdmin(userId: bigint): Promise<PlatformUser | null> {
    const key = userId.toString();
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.user;

    const row = await this.prisma.users.findFirst({
      where: { id: userId, role: 'superadmin', organization_id: null, is_active: true },
      select: { id: true, email: true, first_name: true, last_name: true },
    });
    this.cache.set(key, { user: row, expires: Date.now() + CACHE_TTL_MS });
    return row;
  }

  invalidate(userId?: bigint): void {
    if (userId === undefined) this.cache.clear();
    else this.cache.delete(userId.toString());
  }
}
