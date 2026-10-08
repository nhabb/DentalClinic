import type { PatientsService } from '../../patients/patients.service';
import type { PrismaService } from '../../../shared/prisma/prisma.service';
import type { ToolHandlers } from './tool-handler';

/** Patient profiles and their uploaded documents. */
export function patientTools(
  patients: PatientsService,
  prisma: PrismaService,
): ToolHandlers {
  return {
    list_patients: (a) =>
      patients.findAll(
        a.numOr(1, 'page'),
        a.numOr(10, 'limit'),
        a.str('search'),
      ),

    get_patient: (a) => patients.findById(a.id('id')),

    list_patient_documents: async (a) => {
      const page = a.numOr(1, 'page');
      const limit = a.numOr(20, 'limit');
      const where = { patient_id: a.id('patient_id') };
      const [docs, total] = await Promise.all([
        prisma.patient_documents.findMany({
          where,
          orderBy: { uploaded_at: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.patient_documents.count({ where }),
      ]);
      return {
        data: docs,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    },
  };
}
