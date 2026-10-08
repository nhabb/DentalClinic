import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccessControlService } from './access-control.service';

const patient = { id: '10', role: 'patient' };
const doctor = { id: '2', role: 'doctor' };
const admin = { id: '1', role: 'admin' };

describe('AccessControlService', () => {
  let prisma: { patient_profiles: { findUnique: jest.Mock } };
  let access: AccessControlService;

  beforeEach(() => {
    prisma = { patient_profiles: { findUnique: jest.fn() } };
    access = new AccessControlService(prisma as any);
  });

  it('classifies roles', () => {
    expect(access.isStaff(patient)).toBe(false);
    expect(access.isStaff(doctor)).toBe(true);
    expect(access.isOrgAdmin(doctor)).toBe(false);
    expect(access.isOrgAdmin(admin)).toBe(true);
  });

  describe('assertSelfOrStaff', () => {
    it('allows staff on anyone and users on themselves', () => {
      expect(() => access.assertSelfOrStaff(doctor, 10)).not.toThrow();
      expect(() => access.assertSelfOrStaff(patient, '10')).not.toThrow();
      expect(() => access.assertSelfOrStaff(patient, 10n)).not.toThrow();
    });

    it('rejects a patient acting on another user', () => {
      expect(() => access.assertSelfOrStaff(patient, 11)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertSelf', () => {
    it('rejects even staff acting on someone else', () => {
      expect(() => access.assertSelf(admin, 10)).toThrow(ForbiddenException);
      expect(() => access.assertSelf(admin, 1)).not.toThrow();
    });
  });

  describe('assertPatientProfileAccess', () => {
    it('skips the lookup for staff', async () => {
      await expect(
        access.assertPatientProfileAccess(doctor, 5),
      ).resolves.toBeUndefined();
      expect(prisma.patient_profiles.findUnique).not.toHaveBeenCalled();
    });

    it('allows a patient on their own profile', async () => {
      prisma.patient_profiles.findUnique.mockResolvedValue({ user_id: 10n });
      await expect(
        access.assertPatientProfileAccess(patient, 5),
      ).resolves.toBeUndefined();
    });

    it("rejects a patient on someone else's profile", async () => {
      prisma.patient_profiles.findUnique.mockResolvedValue({ user_id: 11n });
      await expect(
        access.assertPatientProfileAccess(patient, 5),
      ).rejects.toThrow(ForbiddenException);
    });

    it('reports an invisible profile as not found', async () => {
      prisma.patient_profiles.findUnique.mockResolvedValue(null);
      await expect(
        access.assertPatientProfileAccess(patient, 5),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('ownPatientProfileId', () => {
    it('returns the profile of the caller', async () => {
      prisma.patient_profiles.findUnique.mockResolvedValue({ id: 5n });
      await expect(access.ownPatientProfileId(patient)).resolves.toBe(5n);
    });

    it('rejects accounts without a profile', async () => {
      prisma.patient_profiles.findUnique.mockResolvedValue(null);
      await expect(access.ownPatientProfileId(doctor)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
