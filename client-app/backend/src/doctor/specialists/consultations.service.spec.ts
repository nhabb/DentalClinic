import { BadRequestException } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';

function build(current: Record<string, unknown>) {
  const prisma = {
    specialist_consultations: {
      findUnique: jest.fn().mockResolvedValue(current),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 9n, ...args.data }),
      ),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...current, ...args.data }),
      ),
    },
  };
  const caseLinks = { assertValid: jest.fn().mockResolvedValue(undefined) };
  const specialists = { assertActive: jest.fn().mockResolvedValue(undefined) };
  const service = new ConsultationsService(
    prisma as never,
    caseLinks as never,
    specialists as never,
  );
  return { service, prisma, caseLinks, specialists };
}

const requested = {
  id: 3n,
  patient_id: 31n,
  appointment_id: 44n,
  record_id: null,
  status: 'requested',
};

describe('ConsultationsService', () => {
  it('validates the case links and the specialist before creating', async () => {
    const { service, prisma, caseLinks, specialists } = build(requested);
    await service.create(
      { patient_id: 31, specialist_id: 2, reason: 'Impacted wisdom tooth' },
      55n,
    );
    expect(caseLinks.assertValid).toHaveBeenCalledWith(
      expect.objectContaining({ patient_id: 31 }),
    );
    expect(specialists.assertActive).toHaveBeenCalledWith(2n);
    const data = prisma.specialist_consultations.create.mock.calls[0][0]
      .data as unknown as { requested_by: bigint; status: string };
    expect(data.requested_by).toBe(55n);
    expect(data.status).toBe('requested');
  });

  it('refuses a status change on a completed or cancelled consultation', async () => {
    const { service } = build({ ...requested, status: 'completed' });
    await expect(
      service.update(3n, { status: 'scheduled' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(3n, { outcome: 'Extraction done, healing well' }),
    ).resolves.toBeDefined();
  });

  it('re-checks the links with the current values filled in', async () => {
    const { service, caseLinks } = build(requested);
    await service.update(3n, { record_id: 7 });
    expect(caseLinks.assertValid).toHaveBeenCalledWith({
      patient_id: 31,
      appointment_id: 44,
      record_id: 7,
    });
  });
});
