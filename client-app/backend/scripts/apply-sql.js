#!/usr/bin/env node
/**
 * Apply a SQL file to the database in one round trip.
 *
 *   node scripts/apply-sql.js prisma/migrations/<folder>/migration.sql
 *
 * Why not `prisma migrate dev`: this database has no _prisma_migrations history
 * (it was evolved with db push / manual SQL), so migrate dev would try to replay
 * every old migration. And `prisma db execute` splits the script on ";" in some
 * setups, which breaks function bodies ($$ ... $$). This sends the whole file as a
 * single multi-statement query, so a BEGIN/COMMIT pair in the file makes it atomic.
 *
 * Uses DIRECT_URL (falls back to DATABASE_URL) from backend/.env.
 */
const path = require('node:path');
const fs = require('node:fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/apply-sql.js <file.sql>');
    process.exit(2);
  }
  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('DIRECT_URL / DATABASE_URL is not set');
    process.exit(2);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  const who = await client.query('select current_user, current_database()');
  console.log(
    `Applying ${path.basename(path.dirname(path.resolve(file)))}/${path.basename(file)} as ${who.rows[0].current_user} on ${who.rows[0].current_database}`,
  );

  client.on('notice', (n) => console.log(`  notice: ${n.message}`));
  try {
    await client.query(sql);
    console.log('Done.');
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    if (err.position) {
      const upTo = sql.slice(0, Number(err.position));
      console.error(`  at line ${upTo.split('\n').length}`);
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
