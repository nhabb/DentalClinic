/**
 * Shared pieces of the end-to-end smoke scripts (smoke-tenancy, smoke-permissions):
 * talking to the running API, logging in, giving test accounts a password and
 * reporting PASS/FAIL rows.
 */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const BASE = (process.env.API_URL ?? 'http://localhost:5000') + '/api';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'demo123';

const results = [];
const record = (name, ok, detail) =>
  results.push({
    check: name,
    ok: ok ? 'PASS' : 'FAIL',
    detail: String(detail ?? '').slice(0, 100),
  });

/** Prints the result table and exits non-zero when anything failed. */
function report(fatal) {
  if (fatal) console.error('FATAL', fatal);
  console.table(results);
  const failed = results.filter((r) => r.ok === 'FAIL').length;
  console.log(
    fatal
      ? `aborted after ${results.length} check(s)`
      : failed
        ? `${failed} check(s) FAILED`
        : `all ${results.length} checks passed`,
  );
  process.exit(failed || fatal ? 1 : 0);
}

async function api(method, route, { token, body, headers = {} } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const claims = (token) =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

async function waitForServer(ms = 120_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(BASE + '/docs')).status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function login(email, password = PASSWORD) {
  const res = await api('POST', '/auth/login', { body: { email, password } });
  return {
    ok: res.status === 200,
    token: res.json?.token,
    user: res.json?.user,
    detail: `status ${res.status} ${res.json?.message ?? ''}`,
  };
}

/** Direct database connection as the migration login (bypasses RLS). */
function dbClient() {
  return new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  });
}

/** Give an account created through the API a known password. */
async function setPassword(email, password = PASSWORD) {
  const pg = dbClient();
  await pg.connect();
  try {
    await pg.query(
      `update users set password_hash = $1, must_set_password = false where email = $2`,
      [await bcrypt.hash(password, 10), email],
    );
  } finally {
    await pg.end();
  }
}

/** Removes an organization and everything that belongs to it. */
async function deleteOrganizationBySlug(slug) {
  const pg = dbClient();
  await pg.connect();
  try {
    const org = await pg.query(`select id from organizations where slug = $1`, [
      slug,
    ]);
    for (const { id } of org.rows) {
      await pg.query(`delete from users where organization_id = $1`, [id]);
      await pg.query(`delete from organizations where id = $1`, [id]);
    }
  } finally {
    await pg.end();
  }
}

module.exports = {
  BASE,
  PASSWORD,
  api,
  claims,
  dbClient,
  deleteOrganizationBySlug,
  login,
  record,
  report,
  results,
  setPassword,
  waitForServer,
};
