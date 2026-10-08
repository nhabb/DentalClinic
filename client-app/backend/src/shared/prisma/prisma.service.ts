import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { expensesDelegate } from '../generated/prisma/models/expenses';
import { TenantPool, configuredAppRole } from '../tenant/tenant-pool';
import { tenantSafetyExtension } from './tenant-safety.extension';

/**
 * The application's database client.
 *
 * Tenant isolation is enforced by the database (row-level security). This class
 * only wires the two pieces that make that work from Node:
 *   - TenantPool tags every connection with the current request's tenant;
 *   - tenantSafetyExtension stops Prisma from merging different requests'
 *     unique lookups into one statement.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  declare expenses: expensesDelegate;

  constructor() {
    // On Vercel every function instance gets its own pool, so keep each one tiny and
    // quick to release. Other hosts run one long-lived process and keep pg defaults.
    const pool = new TenantPool({
      connectionString: process.env.DATABASE_URL,
      ...(process.env.VERCEL ? { max: 2, idleTimeoutMillis: 5_000 } : {}),
    });
    super({ adapter: new PrismaPg(pool) });

    // The extended client is a proxy over this instance; returning it from the
    // constructor makes it what Nest injects everywhere as PrismaService.
    return this.$extends(tenantSafetyExtension(this)) as unknown as this;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    const role = configuredAppRole();
    new Logger(PrismaService.name).log(
      role
        ? `Connected; tenant isolation via RLS role "${role}"`
        : 'Connected; DB_APP_ROLE empty, RLS not enforced by role switch',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
