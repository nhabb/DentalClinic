#!/usr/bin/env node
/**
 * End-to-end check of multi-tenancy and API protection against a RUNNING backend
 * and the real database.
 *
 *   node scripts/smoke-tenancy.js            # backend on http://localhost:5000
 *   API_URL=http://host:5000 node scripts/smoke-tenancy.js
 *
 * What it proves, through the HTTP API only:
 *   1. the existing clinic (slug `brightsmile`) still works: login, lists, KPIs;
 *   2. tokens carry the tenant and /organizations, /branches work;
 *   3. a second organization created by the superadmin sees none of the first
 *      one's data, and the first one does not see the second one's staff;
 *   4. API layers: no token = 401, patient tokens cannot reach staff routes or
 *      other users' data, branch-restricted staff only see their branch, a
 *      deactivated account is rejected on its next request.
 *
 * Needs the demo accounts (doctor@demo.com / patient@demo.com / super@demo.com,
 * password demo123) and DEFAULT_ORGANIZATION_SLUG=brightsmile in backend/.env.
 * Everything it creates is removed at the end (directly in the database, as the
 * migration login).
 */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const BASE = (process.env.API_URL ?? 'http://localhost:5000') + '/api';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'demo123';
const TEST_SLUG = 'smoke-test-clinic';
const SMOKE_EMAILS = ['smoke-doctor@example.com', 'smoke-tyre-secretary@example.com', 'smoke-patient@example.com'];
const SLOT_DATE = '2099-01-01';

const results = [];
const record = (name, ok, detail) =>
  results.push({ check: name, ok: ok ? 'PASS' : 'FAIL', detail: String(detail ?? '').slice(0, 100) });

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

const claims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

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

async function login(email) {
  const res = await api('POST', '/auth/login', { body: { email, password: PASSWORD } });
  return { ok: res.status === 200, token: res.json?.token, user: res.json?.user, detail: `status ${res.status} ${res.json?.message ?? ''}` };
}

function dbClient() {
  return new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
}

/** Give a staff account created through the API a known password (as the migration login). */
async function setPassword(email, password) {
  const pg = dbClient();
  await pg.connect();
  try {
    await pg.query(`update users set password_hash = $1, must_set_password = false where email = $2`, [
      await bcrypt.hash(password, 10),
      email,
    ]);
  } finally {
    await pg.end();
  }
}

async function cleanup(ids) {
  const pg = dbClient();
  await pg.connect();
  try {
    await pg.query(`delete from appointment_slots where slot_date = $1`, [SLOT_DATE]);
    await pg.query(`delete from users where email = any($1)`, [SMOKE_EMAILS]);
    if (ids.branchId) await pg.query(`delete from branches where id = $1`, [ids.branchId]);
    const org = await pg.query(`select id from organizations where slug = $1`, [TEST_SLUG]);
    for (const { id } of org.rows) {
      await pg.query(`delete from users where organization_id = $1`, [id]);
      await pg.query(`delete from organizations where id = $1`, [id]);
    }
  } finally {
    await pg.end();
  }
}

async function main() {
  if (!(await waitForServer())) {
    console.error(`Backend not reachable at ${BASE}`);
    process.exit(1);
  }
  const ids = {};

  try {
    // ── 1. Existing clinic ──────────────────────────────────────────────────
    const doctor = await login('doctor@demo.com');
    record('login doctor', doctor.ok, doctor.detail);
    if (!doctor.ok) throw new Error('cannot continue without the doctor login');
    const t = doctor.token;
    const c = claims(t);
    record('jwt carries org_id', typeof c.org_id === 'string', JSON.stringify({ org_id: c.org_id, branch_id: c.branch_id }));
    const orgId = c.org_id;

    const me = await api('GET', '/auth/me', { token: t });
    record('auth/me includes organization', me.json?.organization?.id === orgId, me.json?.organization?.slug);

    const totals = {};
    for (const [name, route] of [
      ['appointments', '/appointments?limit=1'],
      ['patients', '/patients?limit=1'],
      ['inventory', '/inventory?limit=1'],
      ['invoices', '/billing/invoices?limit=1'],
      ['slots', '/appointment-slots?limit=1'],
    ]) {
      const res = await api('GET', route, { token: t });
      totals[name] = res.json?.meta?.total;
      record(`${name} list works`, res.status === 200 && Number.isInteger(totals[name]), `total=${totals[name]}`);
    }
    const kpis = await api('GET', '/billing/kpis', { token: t });
    record('billing kpis', kpis.status === 200 && !!kpis.json?.all_time, `invoices=${kpis.json?.all_time?.total_invoices}`);

    const org = await api('GET', '/organizations/me', { token: t });
    record('organizations/me', org.status === 200 && Array.isArray(org.json?.branches), `${org.json?.name}, branches=${org.json?.branches?.length}`);
    const defaultBranch = org.json?.branches?.find((b) => b.is_default)?.id;
    const branchesBefore = (await api('GET', '/branches', { token: t })).json?.length;

    // ── 2. Branches ─────────────────────────────────────────────────────────
    const branch = await api('POST', '/branches', { token: t, body: { name: 'Smoke Test Branch', city: 'Tyre' } });
    record('admin creates a branch', branch.status === 201 && branch.json?.organization_id === orgId, `status ${branch.status} ${branch.json?.message ?? ''}`);
    ids.branchId = branch.json?.id;

    const slotAt = await api('POST', '/appointment-slots', { token: t, body: { doctor_id: Number(doctor.user.id), slot_date: SLOT_DATE, start_time: '09:00', branch_id: Number(ids.branchId) } });
    record('slot created at the named branch', slotAt.status === 201 && slotAt.json?.branch_id === String(ids.branchId), `branch_id=${slotAt.json?.branch_id} ${slotAt.json?.message ?? ''}`);

    const slotDefault = await api('POST', '/appointment-slots', { token: t, body: { doctor_id: Number(doctor.user.id), slot_date: SLOT_DATE, start_time: '10:00' } });
    record('slot without branch lands on the default branch', slotDefault.status === 201 && slotDefault.json?.branch_id === defaultBranch, `branch_id=${slotDefault.json?.branch_id} default=${defaultBranch}`);

    const filtered = await api('GET', `/appointment-slots?branch_id=${ids.branchId}`, { token: t });
    record('slots can be filtered by branch', filtered.json?.meta?.total === 1, `total=${filtered.json?.meta?.total}`);

    record('doctor cannot list all organizations', (await api('GET', '/organizations', { token: t })).status === 403);

    // ── 3. API layer: token and roles ───────────────────────────────────────
    record('no token -> 401 on a protected route', (await api('GET', '/patients')).status === 401);
    record('no token -> 401 on patient documents', (await api('GET', '/patient-documents')).status === 401);
    record('forged token -> 401', (await api('GET', '/patients', { token: t.slice(0, -2) + 'xx' })).status === 401);

    const doctorsDefault = await api('GET', '/users/doctors');
    record('anonymous /users/doctors resolves the default clinic', doctorsDefault.status === 200 && doctorsDefault.json?.length > 0, `n=${doctorsDefault.json?.length}`);
    record('anonymous /users/by-email', (await api('GET', '/users/by-email?email=doctor@demo.com')).status === 200);

    const createdPatient = await api('POST', '/patients', { token: t, body: { email: SMOKE_EMAILS[2], first_name: 'Smoke', last_name: 'Patient' } });
    record('staff creates a patient', createdPatient.status === 201, `status ${createdPatient.status} ${createdPatient.json?.message ?? ''}`);
    await setPassword(SMOKE_EMAILS[2], PASSWORD);
    const patient = await login(SMOKE_EMAILS[2]);
    record('login patient', patient.ok, patient.detail);
    if (patient.ok) {
      const p = patient.token;
      const pid = Number(patient.user.id);
      record('patient cannot list patients', (await api('GET', '/patients', { token: p })).status === 403);
      record('patient cannot list invoices', (await api('GET', '/billing/invoices', { token: p })).status === 403);
      record('patient cannot use the agent', (await api('POST', '/agent/chat', { token: p, body: { messages: [] } })).status === 403);
      record('patient cannot create staff', (await api('POST', '/users/staff', { token: p, body: { email: 'x@y.z', first_name: 'a', last_name: 'b', role: 'doctor' } })).status === 403);
      record("patient cannot read another user's notifications", (await api('GET', `/notifications?user_id=${doctor.user.id}`, { token: p })).status === 403);
      record('patient reads own notifications', (await api('GET', `/notifications?user_id=${pid}`, { token: p })).status === 200);
      record("patient cannot read another user's invoices", (await api('GET', `/patient/billing/invoices?user_id=${doctor.user.id}`, { token: p })).status === 403);
      record('patient reads own invoices', (await api('GET', `/patient/billing/invoices?user_id=${pid}`, { token: p })).status === 200);
      record('patient reads own profile', (await api('GET', `/patients/by-user/${pid}`, { token: p })).status === 200);
      record("patient cannot read another user's profile", (await api('GET', `/patients/by-user/${doctor.user.id}`, { token: p })).status === 403);
      record('patient browses available slots', (await api('GET', '/patient/available-slots?limit=1', { token: p })).status === 200);
      record('patient cannot create slots', (await api('POST', '/appointment-slots', { token: p, body: { doctor_id: 1, slot_date: SLOT_DATE, start_time: '11:00' } })).status === 403);
    }


    // ── 4. Branch-restricted staff ──────────────────────────────────────────
    const tyreSec = await api('POST', '/users/staff', {
      token: t,
      body: { email: SMOKE_EMAILS[1], first_name: 'Tyre', last_name: 'Secretary', role: 'secretary', branch_id: Number(ids.branchId), restrict_to_branch: true },
    });
    record('admin creates branch-restricted secretary', tyreSec.status === 201 && tyreSec.json?.restrict_to_branch === true, `status ${tyreSec.status} ${tyreSec.json?.message ?? ''}`);
    await setPassword(SMOKE_EMAILS[1], PASSWORD);
    const sec = await login(SMOKE_EMAILS[1]);
    record('restricted secretary logs in', sec.ok, sec.detail);
    if (sec.ok) {
      const s = sec.token;
      const slots = await api('GET', '/appointment-slots', { token: s });
      record('restricted secretary sees only her branch slots', slots.json?.meta?.total === 1 && slots.json?.data?.[0]?.branch_id === String(ids.branchId), `total=${slots.json?.meta?.total}`);
      record('restricted secretary sees no appointments of other branches', (await api('GET', '/appointments', { token: s })).json?.meta?.total === 0);
      record('restricted secretary cannot query another branch', (await api('GET', `/appointment-slots?branch_id=${defaultBranch}`, { token: s })).status === 403);
      const foreignSlot = await api('POST', '/appointment-slots', { token: s, body: { doctor_id: Number(doctor.user.id), slot_date: SLOT_DATE, start_time: '12:00', branch_id: Number(defaultBranch) } });
      record('restricted secretary cannot create slots at another branch', foreignSlot.status === 403, `status ${foreignSlot.status}`);
      const ownSlot = await api('POST', '/appointment-slots', { token: s, body: { doctor_id: Number(doctor.user.id), slot_date: SLOT_DATE, start_time: '13:00' } });
      record('restricted secretary creates slots at her branch by default', ownSlot.status === 201 && ownSlot.json?.branch_id === String(ids.branchId), `branch_id=${ownSlot.json?.branch_id}`);
      const patientsNow = (await api('GET', '/patients?limit=1', { token: t })).json?.meta?.total;
      record('restricted secretary still sees patients (organization-wide)', (await api('GET', '/patients?limit=1', { token: s })).json?.meta?.total === patientsNow, `total=${patientsNow}`);

      // Lifting the restriction and deactivating are visible on the next request.
      const lifted = await api('PATCH', `/users/${tyreSec.json.id}/assignment`, { token: t, body: { restrict_to_branch: false } });
      record('admin lifts the branch restriction', lifted.status === 200 && lifted.json?.restrict_to_branch === false, `status ${lifted.status} ${lifted.json?.message ?? ''}`);
      record('unrestricted secretary now sees all slots', (await api('GET', '/appointment-slots?limit=1', { token: s })).json?.meta?.total === totals.slots + 3);
      await api('PATCH', `/users/${tyreSec.json.id}/assignment`, { token: t, body: { is_active: false } });
      record('deactivated account is rejected with its old token', (await api('GET', '/appointment-slots', { token: s })).status === 401);
    }

    // ── 5. Second organization: isolation ───────────────────────────────────
    const sup = await login('super@demo.com');
    record('login superadmin', sup.ok, sup.detail);
    if (!sup.ok) throw new Error('cannot continue without the superadmin login');
    record('superadmin jwt has org_id null', claims(sup.token).org_id === null);
    record('superadmin lists organizations', (await api('GET', '/organizations', { token: sup.token })).status === 200);
    record('superadmin unscoped sees every appointment', (await api('GET', '/appointments?limit=1', { token: sup.token })).json?.meta?.total === totals.appointments);

    const created = await api('POST', '/organizations', {
      token: sup.token,
      body: { name: 'Smoke Test Clinic', slug: TEST_SLUG, default_branch: { name: 'Saida Branch', city: 'Saida' } },
    });
    record('superadmin creates an organization', created.status === 201 && created.json?.branches?.[0]?.is_default, `status ${created.status} ${created.json?.message ?? ''}`);
    const newOrgId = created.json?.id;
    const scoped = { token: sup.token, headers: { 'x-organization-id': String(newOrgId) } };

    record('new org sees 0 appointments', (await api('GET', '/appointments', scoped)).json?.meta?.total === 0);
    record('new org sees 0 patients', (await api('GET', '/patients', scoped)).json?.meta?.total === 0);
    record('new org sees 0 inventory', (await api('GET', '/inventory', scoped)).json?.meta?.total === 0);
    const scopedBranches = (await api('GET', '/branches', scoped)).json;
    record('new org sees only its own branch', scopedBranches?.length === 1 && scopedBranches[0].name === 'Saida Branch', `n=${scopedBranches?.length}`);
    record('new org cannot read a foreign branch by id', (await api('GET', `/branches/${ids.branchId}`, scoped)).status === 404);

    const staff = await api('POST', '/users/staff', { ...scoped, body: { email: SMOKE_EMAILS[0], first_name: 'Smoke', last_name: 'Doctor', role: 'doctor' } });
    record('staff created inside the new org', staff.status === 201 && staff.json?.organization_id === String(newOrgId), `status ${staff.status} org=${staff.json?.organization_id}`);

    const doctorsBaseline = await api('GET', '/users/doctors');
    const doctorsNew = await api('GET', '/users/doctors', { headers: { 'x-organization': TEST_SLUG } });
    record('X-Organization header selects the new org for anonymous calls', doctorsNew.json?.length === 1, `n=${doctorsNew.json?.length}`);
    const doctorsOld = await api('GET', '/users/doctors');
    record('default clinic does not see the new staff', doctorsOld.json?.length === doctorsBaseline.json?.length && !doctorsOld.json.some((u) => u.email === SMOKE_EMAILS[0]), `n=${doctorsOld.json?.length}`);

    const branchesAfter = (await api('GET', '/branches', { token: t })).json?.length;
    record('first clinic branch list unaffected by the second org', branchesAfter === branchesBefore + 1, `${branchesBefore} -> ${branchesAfter}`);
  } finally {
    await cleanup(ids);
  }

  console.table(results);
  const failed = results.filter((r) => r.ok === 'FAIL').length;
  console.log(failed ? `${failed} check(s) FAILED` : `all ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  console.table(results);
  process.exit(1);
});
