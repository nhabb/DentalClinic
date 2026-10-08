import type { ConsultationsService } from '../../../doctor/specialists/consultations.service';
import type { LabOrdersService } from '../../../doctor/lab/lab-orders.service';
import type { ToolHandlers } from './tool-handler';

/** Outside specialists helping on cases, and lab work for cases (read-only). */
export function caseTools(
  consultations: ConsultationsService,
  labOrders: LabOrdersService,
): ToolHandlers {
  return {
    list_consultations: (a) =>
      consultations.findAll({
        patient_id: a.num('patient_id'),
        specialist_id: a.num('specialist_id'),
        status: a.str('status'),
        from: a.str('from'),
        to: a.str('to'),
        page: a.numOr(1, 'page'),
        limit: a.numOr(20, 'limit'),
      }),

    list_lab_orders: (a) =>
      labOrders.findAll({
        patient_id: a.num('patient_id'),
        lab_id: a.num('lab_id'),
        status: a.str('status'),
        work_type: a.str('work_type'),
        overdue: a.bool('overdue'),
        page: a.numOr(1, 'page'),
        limit: a.numOr(20, 'limit'),
      }),
  };
}
