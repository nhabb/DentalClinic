import { join } from 'node:path';
import { inventoryRoutes, RouteInfo } from './route-inventory';
import { isKnownPermission } from './permissions';

/**
 * Routes that deliberately accept any signed-in user. Each one either returns
 * only the caller's own data or enforces ownership inside the handler through
 * AccessControlService (the reason says which). Adding a route here needs a
 * reason; everything else must carry @Public, @Roles or @RequirePermissions.
 */
const SELF_SERVICE_ROUTES: Record<string, string> = {
  'GET /auth/me': 'returns the caller',
  'POST /auth/logout': 'stateless; nothing to protect',
  'GET /organizations/me': 'the caller’s own clinic',
  'GET /branches': 'patients pick a branch when booking',
  'GET /branches/:id': 'same; RLS limits it to the caller’s clinic',
  'GET /clinic-profile': 'public-facing clinic information',
  'GET /patient/available-slots': 'free slots, needed to book',
  'GET /users/:id': 'assertSelfOrPermission(staff:read)',
  'PATCH /users/:id': 'assertSelfOrPermission(staff:manage)',
  'PATCH /users/:id/avatar': 'assertSelfOrPermission(staff:manage)',
  'PATCH /users/:id/password': 'assertSelf',
  'POST /appointments': 'assertPatientProfileAccess(appointments:write)',
  'GET /appointments/:id': 'assertPatientProfileAccess(appointments:read)',
  'PATCH /appointments/:id/cancel':
    'assertPatientProfileAccess(appointments:write)',
  'GET /patient/appointments/upcoming':
    'assertSelfOrPermission(appointments:read)',
  'GET /patient/appointments/history':
    'assertSelfOrPermission(appointments:read)',
  'PATCH /patient/appointments/:id/cancel':
    'assertSelfOrPermission + service checks the appointment is the caller’s',
  'GET /patient/billing/invoices': 'assertSelfOrPermission(billing:read)',
  'GET /patient/billing/invoices/:id':
    'assertPatientProfileAccess(billing:read)',
  'GET /patient/payments': 'assertSelfOrPermission(billing:read)',
  'GET /patient/payments/:id': 'assertPatientProfileAccess(billing:read)',
  'GET /patient/patient-records': 'assertSelfOrPermission(records:read)',
  'GET /patient/patient-records/:id':
    'assertPatientProfileAccess(records:read)',
  'GET /patient-documents':
    'own profile, or documents:read when patient_id is given',
  'GET /patient-documents/:id': 'assertPatientProfileAccess(documents:read)',
  'GET /patients/:id': 'assertPatientProfileAccess(patients:read)',
  'PATCH /patients/:id': 'assertPatientProfileAccess(patients:write)',
  'PATCH /patients/:id/photo': 'assertPatientProfileAccess(patients:write)',
  'GET /patients/by-user/:userId': 'assertSelfOrPermission(patients:read)',
  'PATCH /patients/by-user/:userId': 'assertSelfOrPermission(patients:write)',
  'GET /notifications': 'assertSelfOrPermission(staff:manage)',
  'GET /notifications/unread-count': 'assertSelfOrPermission(staff:manage)',
  'PATCH /notifications/read-all': 'assertSelfOrPermission(staff:manage)',
  'PATCH /notifications/:id/read': 'assertSelfOrPermission(staff:manage)',
};

const key = (r: RouteInfo) => `${r.method} ${r.path}`;

describe('API route coverage', () => {
  const routes = inventoryRoutes(join(__dirname, '..', '..'));

  it('finds the API', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('protects every route: public, superadmin, permissions or a listed self-service route', () => {
    const unguarded = routes
      .filter(
        (r) => r.access.kind === 'signed-in' && !SELF_SERVICE_ROUTES[key(r)],
      )
      .map(key);
    expect(unguarded).toEqual([]);
  });

  it('has no stale self-service entries', () => {
    const existing = new Set(routes.map(key));
    const stale = Object.keys(SELF_SERVICE_ROUTES).filter(
      (k) => !existing.has(k),
    );
    expect(stale).toEqual([]);
  });

  it('does not mix self-service entries with guarded routes', () => {
    const guarded = routes
      .filter(
        (r) => r.access.kind !== 'signed-in' && SELF_SERVICE_ROUTES[key(r)],
      )
      .map(key);
    expect(guarded).toEqual([]);
  });

  it('only requires permissions that exist in the catalog', () => {
    const unknown = routes.flatMap((r) =>
      r.access.kind === 'permissions'
        ? r.access.permissions
            .filter((p) => !isKnownPermission(p))
            .map((p) => `${key(r)} → ${p}`)
        : [],
    );
    expect(unknown).toEqual([]);
  });

  it('keeps public routes to the sign-in and booking surface', () => {
    const publicRoutes = routes
      .filter((r) => r.access.kind === 'public')
      .map(key)
      .sort();
    expect(publicRoutes).toMatchSnapshot();
  });
});
