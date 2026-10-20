import { apiFetch } from "@/lib/api/client";

/** "HH:MM" of a slot time; the API stores time-of-day as a UTC instant. */
export function slotHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

interface Slot {
  id: number | string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
}

export interface RescheduleRequest {
  appointmentId: number;
  patientId: number;
  doctorId: number;
  /** YYYY-MM-DD and HH:MM of the new time. */
  date: string;
  time: string;
  durationMinutes: number;
  reason: string;
}

export type RescheduleResult = { ok: true } | { ok: false; message: string };

async function apiMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
  return message || fallback;
}

async function slotsOn(doctorId: number, date: string): Promise<Slot[]> {
  const res = await apiFetch(`/api/appointment-slots?doctor_id=${doctorId}&date=${date}&limit=100`);
  return res.ok ? ((await res.json()).data ?? []) : [];
}

/**
 * Moves an appointment to a new time. The new booking is made first and the
 * old one cancelled only once it exists: cancelling first left the patient
 * with no appointment whenever the booking then failed. A new slot is only
 * created when no booked slot of that doctor overlaps it.
 */
export async function reschedule(req: RescheduleRequest): Promise<RescheduleResult> {
  const end = addMinutesToTime(req.time, req.durationMinutes);
  const slots = await slotsOn(req.doctorId, req.date);
  let slot = slots.find((s) => slotHHMM(s.start_time) === req.time && !s.is_booked);

  if (!slot) {
    const clash = slots.find(
      (s) => s.is_booked && slotHHMM(s.start_time) < end && slotHHMM(s.end_time) > req.time
    );
    if (clash) {
      return {
        ok: false,
        message: `The doctor already has an appointment from ${slotHHMM(clash.start_time)} to ${slotHHMM(clash.end_time)}.`,
      };
    }
    const created = await apiFetch(`/api/appointment-slots/bulk`, {
      method: "POST",
      body: JSON.stringify({
        doctor_id: req.doctorId,
        slot_date: req.date,
        from_time: req.time,
        to_time: end,
        duration_minutes: req.durationMinutes,
      }),
    });
    if (!created.ok) return { ok: false, message: await apiMessage(created, "Could not open a slot at that time.") };
    slot = (await slotsOn(req.doctorId, req.date)).find((s) => slotHHMM(s.start_time) === req.time && !s.is_booked);
    if (!slot) return { ok: false, message: "Could not find the new slot after creating it." };
  }

  const booked = await apiFetch(`/api/appointments`, {
    method: "POST",
    body: JSON.stringify({ patient_id: req.patientId, slot_id: Number(slot.id), reason: req.reason }),
  });
  if (!booked.ok) {
    // Nothing changed yet: the original appointment still stands.
    return { ok: false, message: await apiMessage(booked, "Could not book the new time; the original appointment is unchanged.") };
  }

  const cancelled = await apiFetch(`/api/appointments/${req.appointmentId}/cancel`, {
    method: "PATCH",
    body: JSON.stringify({ reason: "Postponed" }),
  });
  if (!cancelled.ok) {
    return {
      ok: false,
      message: "The new time is booked, but the original appointment could not be cancelled. Cancel it by hand.",
    };
  }
  return { ok: true };
}
