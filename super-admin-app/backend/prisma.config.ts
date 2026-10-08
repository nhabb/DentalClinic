import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * The platform shares the clinic database, so it shares the clinic schema too:
 * there is exactly one source of truth for tables and migrations
 * (../../client-app/backend/prisma). That schema declares a second generator whose output
 * is this app's src/generated/prisma, so `npm run prisma:generate` here produces
 * a client for this app without copying the schema.
 */
export default defineConfig({
  schema: '../../client-app/backend/prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
