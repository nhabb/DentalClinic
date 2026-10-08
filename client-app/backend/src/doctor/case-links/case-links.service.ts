import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

/** What a case-related row may point at. Ids as the API receives them. */
export interface CaseLinks {
  patient_id: number;
  appointment_id?: number | null;
  record_id?: number | null;
}

/**
 * Checks that a patient, and optionally one of their appointments and one of
 * their clinical records, exist in the caller's clinic and belong together.
 * Shared by consultations and lab orders so the rule lives in one place.
 * Row-level security hides other clinics' rows, so "not found" also covers
 * "not yours".
 */
@Injectable()
export class CaseLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async assertValid(links: CaseLinks): Promise<void> {
    const patientId = BigInt(links.patient_id);
    const patient = await this.prisma.patient_profiles.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    if (links.appointment_id) {
      const appointment = await this.prisma.appointments.findUnique({
        where: { id: BigInt(links.appointment_id) },
        select: { patient_id: true },
      });
      if (!appointment) throw new NotFoundException('Appointment not found');
      if (appointment.patient_id !== patientId) {
        throw new BadRequestException(
          'The appointment belongs to another patient',
        );
      }
    }

    if (links.record_id) {
      const record = await this.prisma.patient_records.findUnique({
        where: { id: BigInt(links.record_id) },
        select: { patient_id: true },
      });
      if (!record) throw new NotFoundException('Clinical record not found');
      if (record.patient_id !== patientId) {
        throw new BadRequestException(
          'The clinical record belongs to another patient',
        );
      }
    }
  }
}
