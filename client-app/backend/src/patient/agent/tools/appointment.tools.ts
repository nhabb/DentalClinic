import type { AppointmentsService } from '../../../doctor/appointments/appointments.service';
import type { AppointmentSlotsService } from '../../../doctor/appointment-slots/appointment-slots.service';
import type { ToolHandlers } from './tool-handler';

/** Appointments and the slots they are booked into (read-only). */
export function appointmentTools(
  appointments: AppointmentsService,
  slots: AppointmentSlotsService,
): ToolHandlers {
  return {
    list_appointments: (a) =>
      appointments.findAll({
        doctor_id: a.num('doctor_id'),
        patient_id: a.num('patient_id'),
        status: a.str('status'),
        date: a.str('date'),
        page: a.numOr(1, 'page'),
        limit: a.numOr(10, 'limit'),
      }),

    get_appointment: (a) => appointments.findOne(a.id('id')),

    list_slots: (a) =>
      slots.findAll({
        doctor_id: a.num('doctor_id'),
        date: a.str('date'),
        available_only: a.bool('available_only'),
        limit: 50,
      }),
  };
}
