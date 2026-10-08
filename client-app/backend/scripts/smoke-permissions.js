#!/usr/bin/env node
/**
 * Calls EVERY route of the running API as five different callers and checks
 * that the role & permission layer answers as declared:
 *
 *   caller          | public  | superadmin | permissions | signed-in (self-service)
 *   ----------------+---------+------------+-------------+---------------------------
 *   no token        | allowed | 401        | 401         | 401
 *   patient         |    –    | 403        | 403         | allowed on their own data
 *   staff whose role|    –    | 403        | 403         | never 2xx on the patient's
 *    allows nothing |         |            |             |   data
 *   clinic admin    |    –    | 403        | allowed     | allowed (has every permission)
 *   superadmin      |    –    | allowed    |      –      |      –
 *
 * "allowed" means not 401/403: a 400 for an empty body or a 404 for a dummy id
 * is fine, the route let the caller through. The list of routes and how each
 * is protected comes from the controllers themselves (npm run routes), so a
 * new endpoint is tested the moment it exists.
 *
 * Everything runs inside a throwaway clinic that is removed at the end.
 *
 *   node scripts/smoke-permissions.js                                  # backend on http://localhost:5000
 *   ROUTE_FILTER=/patient/payments node scripts/smoke-permissions.js   # only matching routes
 */
const { execSync } = require('node:child_process');
const path = require('node:path');
const {
  BASE,
  api,
  deleteOrganizationBySlug,
  login,
  record,
  report,
  setPassword,
  waitForServer,
} = require('./lib/smoke-helpers');

const SLUG = 'smoke-permissions-clinic';
const EMAILS = {
  admin: 'smoke-perm-admin@example.com',
  nobody: 'smoke-perm-nobody@example.com',
  patient: 'smoke-perm-patient@example.com',
};
const NO_PERMISSION_ROLE = 'smoke-nobody';
const DUMMY_ID = '999999999';

/** Self-service routes that carry no identity: any signed-in user may call them. */
const OPEN_TO_ANY_USER = new Set([
  'GET /auth/me',
  'POST /auth/logout',
  'GET /organizations/me',
  'GET /branches',
  'GET /clinic-profile',
  'GET /patient/available-slots',
]);

/** Self-service routes nobody but the account itself may call, not even an admin. */
const SELF_ONLY = new Set(['PATCH /users/:id/password']);

/** Bodies that pass validation, so the probe reaches the handler's own checks. */
const BODY_FOR = {
  'PATCH /users/:id/password': {
    old_password: 'not-the-password',
    new_password: 'Smoke1234',
  },
};

/** Public routes that verify a credential themselves, so an empty call is a 401. */
const CREDENTIAL_ROUTES = new Set(['POST /auth/provision']);

const denied = (status) => status === 401 || status === 403;
const allowed = (status) => !denied(status);
const succeeded = (status) => status >= 200 && status < 300;

function loadRoutes() {
  const out = execSync('npx ts-node scripts/route-inventory.ts', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(out.slice(out.indexOf('[')));
}

/**
 * The URL to probe. Every identity in the route (user id, patient profile id)
 * points at the PATIENT, so the patient asks for their own data while the
 * permission-less staff member asks for someone else's. Other ids point at
 * nothing, and so do the ids of DELETE routes: the admin is allowed through
 * them, and the patient must survive the whole run.
 */
function urlFor(route, patient) {
  const keepPatient = route.method !== 'DELETE';
  let url = route.path;
  if (keepPatient) {
    url = url
      .replace(/:userId/g, patient.userId)
      .replace(/^\/users\/:id/, `/users/${patient.userId}`)
      .replace(/^\/patients\/:id/, `/patients/${patient.profileId}`);
  }
  url = url.replace(/:key/g, 'no-such-role').replace(/:[A-Za-z]+/g, DUMMY_ID);
  if (route.access.kind === 'signed-in') {
    url += `?user_id=${patient.userId}&patient_id=${patient.profileId}`;
  }
  return url;
}

const call = (route, url, token) =>
  api(route.method, url, {
    token,
    body:
      route.method === 'GET'
        ? undefined
        : (BODY_FOR[`${route.method} ${route.path}`] ?? {}),
  }).then((r) => ({ status: r.status, message: r.json?.message }));

function expectationsFor(route) {
  const name = `${route.method} ${route.path}`;
  const is = (code) => (s) => s === code;
  switch (route.access.kind) {
    case 'public':
      return [
        ['anon', CREDENTIAL_ROUTES.has(name) ? is(401) : allowed, 'allowed'],
      ];
    case 'superadmin':
      return [
        ['anon', is(401), '401'],
        ['patient', is(403), '403'],
        ['nobody', is(403), '403'],
        ['admin', is(403), '403'],
        ['superadmin', allowed, 'allowed'],
      ];
    case 'permissions':
      return [
        ['anon', is(401), '401'],
        ['patient', is(403), '403'],
        ['nobody', is(403), '403'],
        ['admin', allowed, 'allowed'],
      ];
    case 'signed-in':
      if (SELF_ONLY.has(name)) {
        return [
          ['anon', is(401), '401'],
          ['patient', allowed, 'allowed'],
          ['nobody', is(403), '403'],
          ['admin', is(403), '403'],
        ];
      }
      return [
        ['anon', is(401), '401'],
        ['patient', allowed, 'allowed'],
        ['admin', allowed, 'allowed'],
        OPEN_TO_ANY_USER.has(name)
          ? ['nobody', allowed, 'allowed']
          : ['nobody', (s) => !succeeded(s), 'not 2xx on foreign data'],
      ];
  }
  throw new Error(`unknown access kind for ${name}`);
}

const describeAccess = (access) =>
  access.kind === 'permissions' ? access.permissions.join(',') : access.kind;

/** One PASS/FAIL row per route, describing what every caller got. */
async function probe(route, tokens, patient) {
  const url = urlFor(route, patient);
  const got = {};
  let ok = true;
  const details = [];
  for (const [actor, test, label] of expectationsFor(route)) {
    const { status, message } = await call(route, url, tokens[actor]);
    got[actor] = { status, message };
    const pass = test(status);
    ok &&= pass;
    details.push(`${actor}=${status}${pass ? '' : `≠${label}`}`);
  }
  record(
    `${route.method} ${route.path} [${describeAccess(route.access)}]`,
    ok,
    details.join(' '),
  );
  return got;
}

/** A clinic with an admin, a staff member whose role allows nothing, and a patient. */
async function createActors(superToken) {
  const created = await api('POST', '/organizations', {
    token: superToken,
    body: {
      name: 'Smoke Permissions Clinic',
      slug: SLUG,
      default_branch: { name: 'Main' },
    },
  });
  if (created.status !== 201)
    throw new Error(
      `cannot create clinic: ${created.status} ${created.json?.message}`,
    );
  const scoped = {
    token: superToken,
    headers: { 'x-organization-id': String(created.json.id) },
  };

  const signIn = async (email, what) => {
    await setPassword(email);
    const session = await login(email);
    if (!session.ok)
      throw new Error(`cannot log in ${what}: ${session.detail}`);
    return session;
  };
  const staff = async (opts, email, role) => {
    const res = await api('POST', '/users/staff', {
      ...opts,
      body: { email, first_name: 'Smoke', last_name: role, role },
    });
    if (res.status !== 201)
      throw new Error(
        `cannot create ${role}: ${res.status} ${res.json?.message}`,
      );
    return signIn(email, role);
  };

  const admin = await staff(scoped, EMAILS.admin, 'admin');
  const asAdmin = { token: admin.token };
  const role = await api('POST', '/roles', {
    ...asAdmin,
    body: { key: NO_PERMISSION_ROLE, name: 'Nobody', permissions: [] },
  });
  if (role.status !== 201)
    throw new Error(`cannot create role: ${role.status} ${role.json?.message}`);
  const nobody = await staff(asAdmin, EMAILS.nobody, NO_PERMISSION_ROLE);

  const patientRow = await api('POST', '/patients', {
    ...asAdmin,
    body: { email: EMAILS.patient, first_name: 'Smoke', last_name: 'Patient' },
  });
  if (patientRow.status !== 201)
    throw new Error(
      `cannot create patient: ${patientRow.status} ${patientRow.json?.message}`,
    );
  const patient = await signIn(EMAILS.patient, 'patient');
  const profile = await api('GET', `/patients/by-user/${patient.user.id}`, {
    token: patient.token,
  });
  if (profile.status !== 200)
    throw new Error(`cannot read patient profile: ${profile.status}`);

  return {
    patient: {
      userId: String(patient.user.id),
      profileId: String(profile.json.id),
    },
    tokens: {
      anon: undefined,
      superadmin: superToken,
      admin: admin.token,
      nobody: nobody.token,
      patient: patient.token,
    },
  };
}

async function main() {
  if (!(await waitForServer())) {
    console.error(`Backend not reachable at ${BASE}`);
    process.exit(1);
  }
  const filter = process.env.ROUTE_FILTER;
  const routes = loadRoutes().filter((r) => !filter || r.path.includes(filter));
  console.log(`${routes.length} routes found`);

  const sup = await login('super@demo.com');
  if (!sup.ok) throw new Error(`superadmin login failed: ${sup.detail}`);

  await deleteOrganizationBySlug(SLUG); // leftovers of an aborted run
  const serverErrors = [];
  try {
    const { patient, tokens } = await createActors(sup.token);
    for (const route of routes) {
      const got = await probe(route, tokens, patient);
      for (const [actor, { status, message }] of Object.entries(got)) {
        if (status >= 500)
          serverErrors.push(
            `${route.method} ${route.path} as ${actor} → ${status} ${message ?? ''}`,
          );
      }
    }
  } finally {
    await deleteOrganizationBySlug(SLUG);
  }

  if (serverErrors.length) {
    console.log(`Server errors (5xx):\n  ${serverErrors.join('\n  ')}`);
  }
  record(
    'no route answered a probe with a server error',
    serverErrors.length === 0,
  );
  report();
}

main().catch((e) => report(e));
