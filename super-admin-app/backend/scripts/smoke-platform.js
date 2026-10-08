#!/usr/bin/env node
/**
 * End-to-end check of the platform API against a RUNNING platform backend and
 * the real database.
 *
 *   node scripts/smoke-platform.js              # API on http://localhost:5100
 *   PLATFORM_API_URL=http://host:5100 node scripts/smoke-platform.js
 *
 * Proves: login is platform-only, clinic tokens are refused, the dashboard and
 * clinic list work, a clinic can be onboarded with an owner invite, suspended
 * and reactivated, its roles and accounts can be managed (custom roles, role and
 * branch changes, password links) and everything created here is removed again.
 *
 * Needs the demo platform admin (super@demo.com / demo123).
 */
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const BASE = (process.env.PLATFORM_API_URL ?? 'http://localhost:5100') + '/api';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'demo123';
const TEST_SLUG = 'platform-smoke-clinic';
const OWNER_EMAIL = 'platform-smoke-owner@example.com';

const results = [];
const record = (name, ok, detail) =>
  results.push({ check: name, ok: ok ? 'PASS' : 'FAIL', detail: String(detail ?? '').slice(0, 100) });

async function api(method, route, { token, body } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

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

async function cleanup() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();
  try {
    const org = await pg.query(`select id from organizations where slug = $1`, [TEST_SLUG]);
    for (const { id } of org.rows) {
      await pg.query(`delete from audit_logs where organization_id = $1`, [id]);
      await pg.query(`delete from users where organization_id = $1`, [id]);
      await pg.query(`delete from clinic_profile where organization_id = $1`, [id]);
      await pg.query(`delete from organizations where id = $1`, [id]);
    }
  } finally {
    await pg.end();
  }
}

async function main() {
  if (!(await waitForServer())) {
    console.error(`Platform API not reachable at ${BASE}`);
    process.exit(1);
  }

  try {
    record('no token -> 401', (await api('GET', '/organizations')).status === 401);

    const clinicLike = jwt.sign({ sub: '1', role: 'superadmin' }, process.env.PLATFORM_JWT_SECRET ?? 'x');
    record(
      'token without platform audience -> 401',
      (await api('GET', '/organizations', { token: clinicLike })).status === 401,
    );

    const badLogin = await api('POST', '/auth/login', {
      body: { email: 'doctor@demo.com', password: PASSWORD },
    });
    record(
      'clinic admin cannot log in to the platform',
      badLogin.status === 401,
      `status ${badLogin.status}`,
    );

    const login = await api('POST', '/auth/login', { body: { email: 'super@demo.com', password: PASSWORD } });
    record(
      'platform admin logs in',
      login.status === 200 && !!login.json?.token,
      `status ${login.status} ${login.json?.message ?? ''}`,
    );
    if (login.status !== 200) throw new Error('cannot continue without a platform login');
    const t = login.json.token;

    const me = await api('GET', '/auth/me', { token: t });
    record('auth/me', me.status === 200 && me.json?.email === 'super@demo.com');

    const dash = await api('GET', '/dashboard', { token: t });
    record(
      'dashboard overview',
      dash.status === 200 && dash.json?.organizations?.total >= 1 && dash.json?.monthly?.length === 6,
      `orgs=${dash.json?.organizations?.total}`,
    );

    const list = await api('GET', '/organizations', { token: t });
    const bright = list.json?.find?.((o) => o.slug === 'brightsmile');
    record(
      'clinic list includes brightsmile with numbers',
      !!bright && bright.patients > 0 && bright.branches >= 1,
      JSON.stringify(bright && { patients: bright.patients, staff: bright.staff }),
    );

    const created = await api('POST', '/organizations', {
      token: t,
      body: {
        name: 'Platform Smoke Clinic',
        slug: TEST_SLUG,
        default_branch: { name: 'Tyre Branch', city: 'Tyre' },
        owner: { email: OWNER_EMAIL, first_name: 'Smoke', last_name: 'Owner' },
      },
    });
    record(
      'onboard a clinic with owner invite',
      created.status === 201 && created.json?.invite?.link?.includes('/set-password?token='),
      `status ${created.status} ${created.json?.message ?? ''}`,
    );
    const id = created.json?.id;

    record(
      'duplicate slug rejected',
      (await api('POST', '/organizations', { token: t, body: { name: 'x', slug: TEST_SLUG } })).status ===
        409,
    );

    const detail = await api('GET', `/organizations/${id}`, { token: t });
    record(
      'clinic detail with branch, owner and stats',
      detail.status === 200 &&
        detail.json?.branches?.[0]?.name === 'Tyre Branch' &&
        detail.json?.staff?.[0]?.email === OWNER_EMAIL &&
        detail.json?.monthly?.length === 6,
    );

    const staff = await api('POST', `/organizations/${id}/staff`, {
      token: t,
      body: { email: 'platform-smoke-doc@example.com', first_name: 'Doc', last_name: 'Tor', role: 'doctor' },
    });
    record(
      'add staff to the clinic',
      staff.status === 201 && staff.json?.invite?.link,
      `status ${staff.status} ${staff.json?.message ?? ''}`,
    );

    const reinvite = await api('POST', `/organizations/${id}/staff/${detail.json.staff[0].id}/invite`, {
      token: t,
    });
    record('resend owner invite', reinvite.status === 201 && reinvite.json?.invite?.link);
    const branch = await api('POST', `/organizations/${id}/branches`, {
      token: t,
      body: { name: 'Saida Branch', city: 'Saida', code: 'SAI' },
    });
    record(
      'open a second branch',
      branch.status === 201 && branch.json?.is_default === false,
      `status ${branch.status} ${branch.json?.message ?? ''}`,
    );
    record(
      'duplicate branch name rejected',
      (await api('POST', `/organizations/${id}/branches`, { token: t, body: { name: 'Saida Branch' } }))
        .status === 409,
    );
    const madeDefault = await api('PATCH', `/organizations/${id}/branches/${branch.json?.id}/default`, {
      token: t,
    });
    record(
      'make the new branch the default',
      madeDefault.status === 200 && madeDefault.json?.is_default === true,
    );
    const afterDefault = await api('GET', `/organizations/${id}`, { token: t });
    record(
      'exactly one default branch',
      afterDefault.json?.branches?.filter((b) => b.is_default).length === 1,
    );
    record(
      'cannot deactivate the default branch',
      (
        await api('PATCH', `/organizations/${id}/branches/${branch.json?.id}`, {
          token: t,
          body: { is_active: false },
        })
      ).status === 400,
    );
    const renamed = await api('PATCH', `/organizations/${id}/branches/${branch.json?.id}`, {
      token: t,
      body: { name: 'Saida Main', phone: '+961 7 000 000' },
    });
    record('edit a branch', renamed.status === 200 && renamed.json?.name === 'Saida Main');

    const suspended = await api('PATCH', `/organizations/${id}/active`, {
      token: t,
      body: { is_active: false },
    });
    record('suspend the clinic', suspended.status === 200 && suspended.json?.is_active === false);
    const reactivated = await api('PATCH', `/organizations/${id}/active`, {
      token: t,
      body: { is_active: true },
    });
    record('reactivate the clinic', reactivated.status === 200 && reactivated.json?.is_active === true);

    // ── Accounts, roles and permissions of the clinic ───────────────────────
    const catalog = await api('GET', '/permissions', { token: t });
    record(
      'permission catalog',
      catalog.status === 200 && Array.isArray(catalog.json) && catalog.json.length > 0,
    );

    const roles = await api('GET', `/organizations/${id}/roles`, { token: t });
    const roleKeys = (roles.json ?? []).map((r) => r.key).sort();
    record(
      'clinic has the four default roles',
      roles.status === 200 &&
        JSON.stringify(roleKeys) === JSON.stringify(['admin', 'doctor', 'patient', 'secretary']),
      roleKeys.join(','),
    );
    const adminRole = (roles.json ?? []).find((r) => r.key === 'admin');
    record(
      'admin role is locked with every permission',
      adminRole?.locked === true && adminRole.permissions.length > 20,
    );

    const newRole = await api('POST', `/organizations/${id}/roles`, {
      token: t,
      body: {
        key: 'hygienist',
        name: 'Hygienist',
        permissions: ['appointments:read', 'patients:read', 'agent:use'],
      },
    });
    record(
      'create a custom role',
      newRole.status === 201 && newRole.json?.permissions?.length === 3,
      `status ${newRole.status} ${newRole.json?.message ?? ''}`,
    );
    record(
      'unknown permission is refused',
      (
        await api('POST', `/organizations/${id}/roles`, {
          token: t,
          body: { key: 'bad', name: 'Bad', permissions: ['nope:read'] },
        })
      ).status === 400,
    );
    record(
      'admin permissions cannot be edited',
      (
        await api('PATCH', `/organizations/${id}/roles/admin`, {
          token: t,
          body: { permissions: ['billing:read'] },
        })
      ).status === 400,
    );
    const edited = await api('PATCH', `/organizations/${id}/roles/hygienist`, {
      token: t,
      body: { name: 'Dental hygienist', permissions: ['appointments:read', 'records:read'] },
    });
    record(
      'edit a custom role',
      edited.status === 200 &&
        edited.json?.permissions?.length === 2 &&
        edited.json?.name === 'Dental hygienist',
    );

    const accounts = await api('GET', `/organizations/${id}/accounts`, { token: t });
    const owner = (accounts.json?.data ?? []).find((a) => a.email === OWNER_EMAIL);
    record(
      'list clinic accounts shows the owner',
      accounts.status === 200 && !!owner,
      `total ${accounts.json?.meta?.total}`,
    );
    record(
      'the only admin cannot be demoted',
      (
        await api('PATCH', `/organizations/${id}/accounts/${owner?.id}`, {
          token: t,
          body: { role: 'doctor' },
        })
      ).status === 400,
    );
    record(
      'the only admin cannot be disabled',
      (
        await api('PATCH', `/organizations/${id}/accounts/${owner?.id}`, {
          token: t,
          body: { is_active: false },
        })
      ).status === 400,
    );
    const staffId = staff.json?.id;
    const moved = await api('PATCH', `/organizations/${id}/accounts/${staffId}`, {
      token: t,
      body: {
        role: 'hygienist',
        branch_id: Number(branch.json?.id),
        restrict_to_branch: true,
        phone: '+961 70 123456',
      },
    });
    record(
      'edit a staff account (role, branch, restriction)',
      moved.status === 200 && moved.json?.role === 'hygienist' && moved.json?.restrict_to_branch === true,
      `status ${moved.status} ${moved.json?.message ?? ''}`,
    );
    record(
      'a role the clinic does not have is refused',
      (await api('PATCH', `/organizations/${id}/accounts/${staffId}`, { token: t, body: { role: 'wizard' } }))
        .status === 400,
    );
    record(
      'a role in use cannot be deleted',
      (await api('DELETE', `/organizations/${id}/roles/hygienist`, { token: t })).status === 409,
    );
    const reset = await api('POST', `/organizations/${id}/accounts/${staffId}/password-reset`, { token: t });
    record(
      'password reset issues a link',
      reset.status === 201 &&
        /set-password\?token=/.test(reset.json?.invite?.link ?? '') &&
        typeof reset.json?.emailed === 'boolean',
    );
    const back = await api('PATCH', `/organizations/${id}/accounts/${staffId}`, {
      token: t,
      body: { role: 'doctor', restrict_to_branch: false },
    });
    record('move the account back to doctor', back.status === 200 && back.json?.role === 'doctor');
    record(
      'delete the unused custom role',
      (await api('DELETE', `/organizations/${id}/roles/hygienist`, { token: t })).status === 200,
    );
    const search = await api('GET', `/accounts?search=${encodeURIComponent(OWNER_EMAIL)}`, { token: t });
    record(
      'cross-clinic account search',
      search.status === 200 && search.json?.data?.some((a) => a.email === OWNER_EMAIL),
    );

    const admins = await api('GET', '/admins', { token: t });
    record(
      'list platform admins',
      admins.status === 200 && admins.json?.some?.((a) => a.email === 'super@demo.com'),
    );
    record(
      'cannot deactivate yourself',
      (await api('PATCH', `/admins/${me.json.id}/active`, { token: t, body: { is_active: false } }))
        .status === 400,
    );
  } finally {
    await cleanup();
  }

  console.table(results);
  const failed = results.filter((r) => r.ok === 'FAIL').length;
  console.log(failed ? `${failed} check(s) FAILED` : `all ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error('FATAL', e);
  console.table(results);
  await cleanup().catch(() => {});
  process.exit(1);
});
