#!/usr/bin/env node
/**
 * Proves tenant isolation holds under concurrent load, against a RUNNING backend.
 *
 *   node scripts/smoke-tenant-concurrency.js           # backend on http://localhost:5000
 *   ROUNDS=100 node scripts/smoke-tenant-concurrency.js
 *
 * Why this exists: the connection pool primes each checked-out connection with
 * the caller's tenant (SET ROLE + set_config). When the pool is saturated, pg
 * serves queued requests from inside whichever request just released a
 * connection, so a tenant read at the wrong moment primes the connection for
 * the wrong clinic. That once made one organization see another's row counts
 * (tenant-pool.ts). This script saturates the pool with interleaved requests
 * from every organization and checks that each one always sees exactly the
 * count it sees when queried alone. Only counts are printed, never rows.
 *
 * Needs super@demo.com and doctor@demo.com (password demo123) and at least
 * two organizations in the database. Creates nothing.
 */
const {
  api,
  login,
  record,
  report,
  waitForServer,
} = require('./lib/smoke-helpers');

const ROUNDS = Number(process.env.ROUNDS ?? 40);
const ROUTES = ['/patients?page=1&limit=5', '/appointments?page=1&limit=5'];

const totalOf = (res) =>
  res.status === 200 ? (res.json?.meta?.total ?? null) : `http ${res.status}`;

async function main() {
  if (!(await waitForServer())) return report('backend not reachable');

  const sup = await login('super@demo.com');
  record('superadmin login', sup.ok, sup.detail);
  const doctor = await login('doctor@demo.com');
  record('doctor login', doctor.ok, doctor.detail);
  if (!sup.ok || !doctor.ok) return report('logins failed');

  const orgsRes = await api('GET', '/organizations', { token: sup.token });
  const orgs = (
    Array.isArray(orgsRes.json) ? orgsRes.json : (orgsRes.json?.data ?? [])
  ).filter((o) => o.is_active !== false);
  record(
    'at least two organizations',
    orgs.length >= 2,
    `${orgs.length} found`,
  );
  if (orgs.length < 2) return report();

  // One "caller" per organization: the superadmin scoped by header, plus the demo
  // doctor as a genuine member token of their own organization.
  const callers = orgs.map((o) => ({
    name: `org ${o.id} (${o.slug})`,
    token: sup.token,
    headers: { 'x-organization-id': String(o.id) },
  }));
  callers.push({
    name: 'doctor@demo.com (member token)',
    token: doctor.token,
    headers: {},
  });

  // Baseline: what each caller sees when nothing else is running.
  const baseline = new Map();
  for (const c of callers) {
    for (const route of ROUTES) {
      const res = await api('GET', route, {
        token: c.token,
        headers: c.headers,
      });
      baseline.set(`${c.name} ${route}`, totalOf(res));
    }
  }
  const distinct = new Set([...baseline.values()].map(String));
  record(
    'baselines differ between organizations',
    distinct.size > 1,
    [...baseline.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
  );

  // Saturate the pool: every caller and route interleaved, ROUNDS times.
  const jobs = [];
  for (let i = 0; i < ROUNDS; i++) {
    for (const c of callers) {
      for (const route of ROUTES) {
        jobs.push(
          api('GET', route, { token: c.token, headers: c.headers }).then(
            (res) => ({
              key: `${c.name} ${route}`,
              got: totalOf(res),
            }),
          ),
        );
      }
    }
  }
  const results = await Promise.all(jobs);
  const mismatches = results.filter(
    (r) => String(r.got) !== String(baseline.get(r.key)),
  );
  const sample = mismatches
    .slice(0, 3)
    .map((m) => `${m.key}: expected ${baseline.get(m.key)}, got ${m.got}`);
  record(
    `no cross-tenant results in ${results.length} interleaved requests`,
    mismatches.length === 0,
    mismatches.length
      ? `${mismatches.length} mismatches, e.g. ${sample.join(' | ')}`
      : 'every request saw its own organization',
  );
  report();
}

main().catch((e) => report(e.message));
