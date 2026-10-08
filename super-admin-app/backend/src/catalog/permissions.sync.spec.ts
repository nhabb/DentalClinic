import * as clinic from '../../../../client-app/backend/src/shared/authorization/permissions';
import * as platform from './permissions';

/**
 * The platform edits clinic roles with a copy of the clinic's permission
 * catalog. The copy must stay identical: change the clinic file first, then
 * copy it to src/catalog/permissions.ts.
 */
describe('permission catalog copy', () => {
  it('matches the clinic backend catalog exactly', () => {
    expect(platform.PERMISSION_GROUPS).toEqual(clinic.PERMISSION_GROUPS);
    expect(platform.DEFAULT_ROLES).toEqual(clinic.DEFAULT_ROLES);
    expect(platform.ALL_PERMISSIONS).toEqual(clinic.ALL_PERMISSIONS);
    expect(platform.ADMIN_ROLE_KEY).toBe(clinic.ADMIN_ROLE_KEY);
    expect(platform.PATIENT_ROLE_KEY).toBe(clinic.PATIENT_ROLE_KEY);
  });
});
