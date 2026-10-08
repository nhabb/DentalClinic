import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccessControlService } from './access-control.service';

const patient = { id: '10', role: 'patient', permissions: [] as string[] };
const secretary = {
  id: '2',
  role: 'secretary',
  permissions: ['patients:read', 'billing:read'],
};
const superadmin = { id: '1', role: 'superadmin', permissions: [] as string[] };

describe('AccessControlService', () => {
  let prisma: { patient_profiles: { findUnique: jest.Mock } };
  let access: AccessControlService;

  beforeEach(() => {
    prisma = { patient_profiles: { findUnique: jest.fn() } };
    access = new AccessControlService(prisma as any);
  });

  it('classifies patients and staff', () => {
    expect(access.isPatient(patient)).toBe(true);
    expect(access.isStaff(patient)).toBe(false);
    expect(access.isStaff(secretary)).toBe(true);
  });

  describe('hasPermission / assertPermission', () => {
    it('checks the role’s permission list', () => {
      expect(access.hasPermission(secretary, 'patients:read')).toBe(true);
      expect(access.hasPermission(secretary, 'patients:delete')).toBe(false);
      expect(() =>
        access.assertPermission(secretary, 'patients:delete'),
      ).toThrow(ForbiddenException);
    });

    it('treats the platform superadmin as holding everything', () => {
      expect(access.hasPermission(superadmin, 'roles:manage')).toBe(true);
    });
  });

  describe('assertSelfOrPermission', () => {
    it('allows users on themselves regardless of permissions', () => {
      expect(() =>
        access.assertSelfOrPermission(patient, '10', 'staff:manage'),
      ).not.toThrow();
      expect(() =>
        access.assertSelfOrPermission(secretary, 2n, 'staff:manage'),
      ).not.toThrow();
    });

    it('requires the permission for other users', () => {
      expect(() =>
        access.assertSelfOrPermission(secretary, 11, 'patients:read'),
      ).not.toThrow();
      expect(() =>
        access.assertSelfOrPermission(secretary, 11, 'staff:manage'),
      ).toThrow(ForbiddenException);
      expect(() =>
        access.assertSelfOrPermission(patient, 11, 'patients:read'),
      ).toThrow(/own data/);
    });
  });

  describe('assertSelf', () => {
    it('rejects anyone acting on someone else', () => {
      expect(() => access.assertSelf(superadmin, 10)).toThrow(
        ForbiddenException,
      );
      expect(() => access.assertSelf(patient, 10)).not.toThrow();
    });
  });

  describe('assertPatientProfileAccess', () => {
    it('allows the profile owner without any permission', async () => {
      prisma.patient_profiles.findUnique.mockResolvedValue({ user_id: 10n });
      await expect(
        access.assertPatientProfileAccess(patient, 5, 'patients:read'),
      ).resolves.toBeUndefined();
    });

    it("requires the permission for someone else's profile", async () => {
      prisma.patient_profiles.findUnique.mockResolvedValue({ user_id: 11n });
      await expect(
        access.assertPatientProfileAccess(secretary, 5, 'patients:read'),
      ).resolves.toBeUndefined();
      await expect(
        access.assertPatientProfileAccess(secretary, 5, 'patients:delete'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        access.assertPatientProfileAccess(patient, 5, 'patients:read'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('reports an invisible profile as not found', async () => {
      prisma.patient_profiles.findUnique.mockResolvedValue(null);
      await expect(
        access.assertPatientProfileAccess(secretary, 5, 'patients:read'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('ownPatientProfileId', () => {
    it('returns the profile of the caller and rejects accounts without one', async () => {
      prisma.patient_profiles.findUnique.mockResolvedValueOnce({ id: 5n });
      await expect(access.ownPatientProfileId(patient)).resolves.toBe(5n);
      prisma.patient_profiles.findUnique.mockResolvedValueOnce(null);
      await expect(access.ownPatientProfileId(secretary)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
