import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { expensesDelegate } from '../generated/prisma/models/expenses';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  declare expenses: expensesDelegate;

  constructor() {
    // On Vercel every function instance gets its own pool, so keep each one
    // tiny and quick to release (pair with Supabase's transaction pooler,
    // port 6543). Other hosts run one long-lived process and keep pg defaults.
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ...(process.env.VERCEL ? { max: 2, idleTimeoutMillis: 5_000 } : {}),
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
