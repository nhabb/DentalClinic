import type { BadgeTone } from "@/components/ui/Badge";
import type {
  MessageLanguage,
  MessageKind,
  MessageStatus,
  MetaStatus,
  RuleKind,
  TemplateKind,
  WhatsAppMessage,
  DateField,
  FieldKey,
  FieldKind,
  RuleDefinition,
  RuleLimits,
  TriggerType,
} from "@/lib/api/whatsapp";

/*
 * The words of the WhatsApp page, in one place, like money-words.ts: what
 * each reminder is, what each placeholder stands for, what each status
 * means to a secretary, and the help a non-technical owner needs to connect
 * a number. English here; nav, tab and patient-file labels are i18n keys.
 */

/** The five built-in cards of the Reminders tab, in the order they are shown. */
export const CARD_KINDS: Exclude<TemplateKind, "custom">[] = [
  "appointment_reminder",
  "booking_confirmation",
  "unpaid_bill",
  "recall",
  "staff_daily",
];

/** The rules each card controls. */
export const RULES_OF_CARD: Record<Exclude<TemplateKind, "custom">, RuleKind[]> = {
  appointment_reminder: ["appointment_day_before", "appointment_morning_of"],
  booking_confirmation: ["booking_confirmation"],
  unpaid_bill: ["unpaid_bill"],
  recall: ["recall"],
  staff_daily: ["staff_daily"],
};

export const KIND_TITLE: Record<TemplateKind, string> = {
  appointment_reminder: "Appointment reminder",
  booking_confirmation: "Booking confirmation",
  unpaid_bill: "Unpaid bill reminder",
  recall: "Check-up recall",
  staff_daily: "Doctor's daily schedule",
  custom: "Your own reminder",
};

export const KIND_DESCRIPTION: Record<TemplateKind, string> = {
  appointment_reminder: "The day before and/or the morning of an appointment: date, time, doctor and clinic.",
  booking_confirmation: "Sent right away when an appointment is booked.",
  unpaid_bill: "When a bill passes its due date, with the amount and bill number; repeats while unpaid.",
  recall: "When a patient has not visited for a while, inviting them to book a check-up.",
  staff_daily: "Every morning, each doctor with appointments that day gets their list.",
  custom: "A rule the clinic wrote, from parts: when, who and what, in your own words.",
};

export const RULE_TITLE: Record<RuleKind, string> = {
  appointment_day_before: "The day before",
  appointment_morning_of: "The same morning",
  booking_confirmation: "When booked",
  unpaid_bill: "Unpaid bill",
  recall: "Check-up recall",
  staff_daily: "Every morning",
};

/** Who gets it, in one line. */
export const KIND_RECIPIENTS: Record<TemplateKind, string> = {
  appointment_reminder:
    "The patient, in their language (English or Arabic; French speakers get English). Patients who asked for no WhatsApp are skipped.",
  booking_confirmation: "The patient, in their language. Patients who asked for no WhatsApp are skipped.",
  unpaid_bill: "The patient who owes the bill, in their language.",
  recall: "Patients with no visit for the set months and nothing booked, in their language.",
  staff_daily: "Every doctor with a mobile number on their account, in the clinic's language.",
  custom: "The patients the rule describes, in their language. Once per subject (a procedure, a visit, a bill, a date), never twice.",
};

/** The triggers a reminder of the clinic's own can be built on. */
export const TRIGGER_TITLE: Record<TriggerType, string> = {
  procedure: "After a procedure",
  appointment: "Around an appointment",
  since_last_visit: "Since the last visit",
  date_on_file: "A date on the patient's file, every year",
  unpaid_bill: "An unpaid bill",
  yearly: "A date every year",
  monthly: "A day every month",
  weekly: "A weekday every week",
  once: "One date, once",
  query: "When the assistant's query finds them",
};
export const TRIGGER_HINT: Record<TriggerType, string> = {
  procedure: "A set time after work is marked done on the chart; once per procedure.",
  appointment: "Before an upcoming appointment, or after a completed visit; once per appointment.",
  since_last_visit: "When the last visit is that long ago and nothing newer happened; once, or again every N days while they stay away.",
  date_on_file: "The birthday, the anniversary of the first visit, or of joining the clinic; once a year each, on the day or a few days around it.",
  unpaid_bill: "When a bill passes its due date by that many days; once per bill, or again every N days while unpaid.",
  yearly: "A fixed date each year: New Year, the clinic's anniversary. A holiday with a moving date is a \"one date, once\" rule.",
  monthly: "The same day each month (1 to 28).",
  weekly: "The same weekday each week, to patients or to the doctors.",
  once: "A single date, then never again.",
  query: "Any event in the data: the assistant's query returns each patient with the day it is due and what it is about, and sends once per record (older than 30 days: never; still ahead: when it comes).",
};
export const DATE_FIELD_TITLE: Record<DateField, string> = {
  birthday: "the patient's birthday",
  first_visit: "the anniversary of the first visit",
  registration: "the anniversary of joining the clinic",
};
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The facts a condition can be about, in the order the menu shows them
 * (mirrors FIELDS in custom-rules.ts on the API): the kind decides the
 * operators and the value control, the group is the menu heading.
 */
export interface FieldWords {
  kind: FieldKind;
  label: string;
  group: "Visits" | "Money" | "Treatment" | "About them" | "Messages";
  /** number: what is counted; past/future: nothing (the control picks days / weeks / months). */
  unit?: string;
  /** choice: value → label; "procedures" and "doctors" come from the vocabulary. */
  options?: [string, string][] | "procedures" | "doctors";
}
export const LANGUAGE_WORD: Record<string, string> = { en: "English", ar: "Arabic", fr: "French" };
export const FIELD_WORDS: Record<FieldKey, FieldWords> = {
  last_visit: { kind: "past", label: "Last visit", group: "Visits" },
  first_visit: { kind: "past", label: "First visit", group: "Visits" },
  registered: { kind: "past", label: "Joined the clinic", group: "Visits" },
  visits: { kind: "number", label: "Number of visits", group: "Visits", unit: "visits" },
  next_booking: { kind: "future", label: "Next appointment", group: "Visits" },
  last_missed: { kind: "past", label: "Last missed appointment", group: "Visits" },
  no_shows: { kind: "number", label: "Missed appointments", group: "Visits", unit: "missed" },
  cancellations: { kind: "number", label: "Cancelled appointments", group: "Visits", unit: "cancelled" },
  doctor: { kind: "history", label: "Seen by a doctor", group: "Visits", options: "doctors" },
  owed: { kind: "number", label: "Money owed", group: "Money", unit: "" },
  unpaid_bills: { kind: "number", label: "Unpaid bills", group: "Money", unit: "bills" },
  overdue_days: { kind: "number", label: "Days overdue (oldest bill)", group: "Money", unit: "days" },
  paid_total: { kind: "number", label: "Money paid in all", group: "Money", unit: "" },
  last_payment: { kind: "past", label: "Last payment", group: "Money" },
  procedure: { kind: "history", label: "Had a procedure", group: "Treatment", options: "procedures" },
  planned_procedure: { kind: "choice", label: "Planned procedure", group: "Treatment", options: "procedures" },
  planned_work: { kind: "number", label: "Planned procedures still to do", group: "Treatment", unit: "procedures" },
  age: { kind: "number", label: "Age", group: "About them", unit: "years" },
  gender: { kind: "choice", label: "Gender", group: "About them", options: [["male", "Male"], ["female", "Female"]] },
  language: { kind: "choice", label: "Language", group: "About them", options: [["en", "English"], ["ar", "Arabic"], ["fr", "French"]] },
  birthday: { kind: "future", label: "Birthday", group: "About them" },
  birth_month: { kind: "choice", label: "Birth month", group: "About them", options: MONTHS.map((m, i) => [String(i + 1), m]) },
  marital_status: {
    kind: "choice",
    label: "Marital status",
    group: "About them",
    options: [["single", "Single"], ["married", "Married"], ["divorced", "Divorced"], ["widowed", "Widowed"], ["other", "Other"]],
  },
  nationality: { kind: "text", label: "Nationality", group: "About them" },
  city: { kind: "text", label: "City", group: "About them" },
  governate: { kind: "text", label: "Governate", group: "About them" },
  occupation: { kind: "text", label: "Occupation", group: "About them" },
  insurance: { kind: "text", label: "Insurance provider", group: "About them" },
  last_message: { kind: "past", label: "Last WhatsApp message from us", group: "Messages" },
};
export const FIELD_GROUPS: FieldWords["group"][] = ["Visits", "Money", "Treatment", "About them", "Messages"];

/** The operators of each kind, in words, in the order the menu shows them. */
export const OP_WORDS: Record<FieldKind, [string, string][]> = {
  number: [["gte", "at least"], ["lte", "at most"], ["gt", "more than"], ["lt", "less than"], ["eq", "exactly"], ["ne", "anything but"], ["between", "between"]],
  past: [["within", "in the last"], ["not_within", "not in the last"], ["before", "before"], ["after", "after"], ["never", "never happened"], ["ever", "happened at some point"]],
  future: [["within", "in the next"], ["not_within", "not in the next"], ["none", "none"], ["any", "any"]],
  choice: [["in", "is one of"], ["not_in", "is not"]],
  text: [["is", "is"], ["is_not", "is not"], ["contains", "contains"], ["not_contains", "does not contain"], ["set", "is filled in"], ["not_set", "is empty"]],
  history: [["had", "had"], ["never_had", "never had"]],
};
/** Operators that take no value. */
export const BARE_OPS = ["never", "ever", "none", "any", "set", "not_set"];
export const EMPTY_LIMITS: RuleLimits = { send_weekdays: [], active_from: null, active_until: null, max_per_run: null };

/** What {{1}}.. stand for in a rule's wording (mirrors paramsOfRule on the API). */
export function paramsOfRule(def: RuleDefinition): string[] {
  switch (def.trigger.type) {
    case "procedure":
      return ["patient_name", "procedure", "date", "clinic"];
    case "appointment":
      return ["patient_name", "date", "time", "doctor", "clinic"];
    case "since_last_visit":
      return ["patient_name", "date", "clinic"];
    case "date_on_file":
      return ["patient_name", "clinic"];
    case "unpaid_bill":
      return ["patient_name", "amount", "bill_number", "clinic"];
    case "query":
      return ["patient_name", "date", "detail", "clinic"];
    default:
      return def.audience === "staff" ? ["doctor_name", "date", "clinic"] : ["patient_name", "date", "clinic"];
  }
}

/** Who a rule reaches, in one line. */
export function recipientsOfRule(def: RuleDefinition): string {
  return def.audience === "staff"
    ? "Every doctor with a mobile number on their account, in the clinic's language."
    : "The patients the rule describes, in their language (English or Arabic; French speakers get English). Patients who asked for no WhatsApp are skipped.";
}

/** What each {{n}} stands for, in words, per kind. */
export const PLACEHOLDER_LABEL: Record<string, string> = {
  patient_name: "Patient name",
  date: "Date",
  time: "Time",
  doctor: "Doctor",
  clinic: "Clinic name",
  amount: "Amount",
  bill_number: "Bill number",
  months: "Months since last visit",
  doctor_name: "Doctor name",
  count: "Number of appointments",
  list: "The day's list",
  procedure: "Procedure",
  detail: "Detail from the query",
};

/** Sample values for the preview, per language. */
export const SAMPLE: Record<string, Record<MessageLanguage, string>> = {
  patient_name: { en: "Maya Haddad", ar: "مايا حداد" },
  date: { en: "Tuesday, 12 November 2026", ar: "الثلاثاء، 12 تشرين الثاني 2026" },
  time: { en: "10:30", ar: "10:30" },
  doctor: { en: "Dr. Karim Nasser", ar: "د. كريم نصر" },
  clinic: { en: "BrightSmile Dental", ar: "عيادة برايت سمايل" },
  amount: { en: "$120.00", ar: "US$ 120.00" },
  bill_number: { en: "IV26-00017", ar: "IV26-00017" },
  months: { en: "6", ar: "6" },
  doctor_name: { en: "Dr. Karim Nasser", ar: "د. كريم نصر" },
  count: { en: "4", ar: "4" },
  list: { en: "09:00 Maya Haddad (check-up) · 10:30 Ali Nasser (filling)", ar: "09:00 مايا حداد · 10:30 علي نصر" },
  procedure: { en: "Root Canal", ar: "علاج العصب" },
};

/** The wording with its placeholders filled with sample values. */
export function renderPreview(body: string, params: string[], language: MessageLanguage, clinicName?: string): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const key = params[Number(n) - 1];
    if (!key) return `{{${n}}}`;
    if (key === "clinic" && clinicName) return clinicName;
    return SAMPLE[key]?.[language] ?? `{{${n}}}`;
  });
}

export const BODY_MAX = 1024;

/** Why a wording cannot be submitted (brick) or is risky (honey), or nothing. */
export function validateBody(body: string, params: string[]): { error?: string; warning?: string } {
  const text = body.trim();
  if (!text) return { error: "The wording is empty." };
  if (text.length > BODY_MAX) return { error: `Longer than ${BODY_MAX} characters.` };
  const seen = new Set<number>();
  for (const m of text.matchAll(/\{\{\s*([^}]*)\s*\}\}/g)) {
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < 1) return { error: `"{{${m[1]}}}" is not a placeholder; use {{1}} to {{${params.length}}}.` };
    if (n > params.length) return { error: `This wording can use {{1}} to {{${params.length}}} only.` };
    seen.add(n);
  }
  for (let i = 1; i <= seen.size; i += 1) {
    if (!seen.has(i)) return { error: `{{${i}}} is missing: placeholders must be used in order, {{1}}, then {{2}}…` };
  }
  if (/^\s*\{\{\d+\}\}/.test(text) || /\{\{\d+\}\}\s*[.!]?\s*$/.test(text)) {
    return { warning: "WhatsApp often rejects wording that starts or ends with a placeholder." };
  }
  return {};
}

/** Pasted credentials, cleaned: no spaces or line breaks, no leading "Bearer ". */
export const cleanPasted = (value: string) => value.replace(/^\s*Bearer\s+/i, "").replace(/\s+/g, "");

export const META_STATUS_LABEL: Record<MetaStatus, string> = {
  draft: "Draft",
  pending: "Waiting for WhatsApp",
  approved: "Approved",
  rejected: "Rejected",
  paused: "Paused by WhatsApp",
};
export const META_STATUS_TONE: Record<MetaStatus, BadgeTone> = {
  draft: "neutral",
  pending: "honey",
  approved: "leaf",
  rejected: "brick",
  paused: "brick",
};
export const META_STATUS_MEANING: Record<MetaStatus, string> = {
  draft: "Written here, not sent to WhatsApp yet.",
  pending: "WhatsApp is reviewing it: usually minutes, sometimes up to a day. This page checks every minute while open.",
  approved: "Can be sent.",
  rejected: "WhatsApp did not accept this wording. Fix it and submit again.",
  paused: "WhatsApp paused this wording for low quality. Reword it and submit again.",
};
export const REJECTION_REASONS = [
  "a placeholder at the very start or end",
  "two placeholders next to each other with nothing between",
  "wording that reads like an advertisement or includes a link",
  "a placeholder with nothing around it to say what it is",
];

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
  skipped: "Skipped",
};
export const MESSAGE_STATUS_TONE: Record<MessageStatus, BadgeTone> = {
  queued: "neutral",
  sent: "brand",
  delivered: "leaf",
  read: "leaf",
  failed: "brick",
  skipped: "honey",
};
export const MESSAGE_STATUS_MEANING: Record<MessageStatus, string> = {
  queued: "Waiting its turn; it goes out within a minute.",
  sent: "Handed to WhatsApp; not yet confirmed on the patient's phone.",
  delivered: "It reached their phone.",
  read: "They opened it.",
  failed: "WhatsApp could not deliver it. The reason is shown; most can be retried.",
  skipped: "Not sent on purpose: no valid number, the patient asked for no WhatsApp, or the wording is not approved yet.",
};

export const SKIP_REASON_TEXT: Record<string, string> = {
  opted_out: "The patient asked for no WhatsApp messages.",
  bad_phone: "The saved number cannot be read as a phone number.",
  no_template: "No wording exists for this reminder.",
  template_not_approved: "The wording is not approved by WhatsApp yet.",
  too_late: "The appointment had already started.",
  not_connected: "The clinic's number was not connected.",
  no_appointments: "No appointments that day.",
};

export const ERROR_CODE_TEXT: Record<string, string> = {
  invalid_token: "WhatsApp refused the access token. Enter a new permanent token on the Connection tab.",
  not_on_whatsapp: "This number is not on WhatsApp.",
  re_engagement: "WhatsApp asks the patient to message the clinic first before more messages.",
  recipient_not_allowed: "Meta allows only listed test numbers until the account is live.",
  template_missing: "WhatsApp does not know this wording; submit it again.",
  template_paused: "WhatsApp paused this wording; reword it and submit again.",
  param_mismatch: "The wording's placeholders do not match what was sent; save and submit it again.",
  rate_limited: "WhatsApp's sending limit was reached; it will be retried.",
  unreachable: "Meta could not be reached; it will be retried.",
  interrupted: "The send was interrupted before Meta answered; retry it.",
  number_not_registered: "The clinic's number is not registered for the API yet.",
  delivery_failed: "WhatsApp could not deliver the message.",
};

/** The reason a row did not reach the patient, in words. */
export function messageReason(m: WhatsAppMessage): string | null {
  if (m.status === "skipped") return SKIP_REASON_TEXT[m.skip_reason ?? ""] ?? m.skip_reason;
  if (m.status === "failed") return ERROR_CODE_TEXT[m.error_code ?? ""] ?? m.error ?? "WhatsApp could not deliver it.";
  return null;
}

export const CONNECTION_ERROR_TEXT: Record<string, string> = {
  invalid_token: "WhatsApp refused this token. Use a permanent System User token, not the 24-hour one from the API Setup page.",
  phone_not_found: "Meta knows no phone with this Phone Number ID for this token. Copy the Phone number ID, not the number itself.",
  unreachable: "Meta could not be reached right now. Try again in a moment.",
  bad_phone: "The test number could not be read as a phone number.",
  template_missing: "The hello_world test wording is missing on this number; the connection itself is fine.",
  number_not_registered: "This number is not registered for the WhatsApp API yet. Finish the number setup in WhatsApp Manager.",
  whatsapp_not_enabled: "WhatsApp is not enabled on this server yet (no sealing key). Ask whoever runs the server to set WHATSAPP_TOKEN_KEY.",
};

export const COUNTRY_CODES: { code: string; label: string }[] = [
  { code: "961", label: "Lebanon (+961)" },
  { code: "971", label: "United Arab Emirates (+971)" },
  { code: "966", label: "Saudi Arabia (+966)" },
  { code: "962", label: "Jordan (+962)" },
  { code: "20", label: "Egypt (+20)" },
  { code: "974", label: "Qatar (+974)" },
  { code: "965", label: "Kuwait (+965)" },
  { code: "33", label: "France (+33)" },
  { code: "1", label: "United States / Canada (+1)" },
];

export const KIND_OF_RULE: Record<MessageKind, TemplateKind> = {
  custom: "custom",
  appointment_day_before: "appointment_reminder",
  appointment_morning_of: "appointment_reminder",
  booking_confirmation: "booking_confirmation",
  unpaid_bill: "unpaid_bill",
  recall: "recall",
  staff_daily: "staff_daily",
};

export const KIND_SHORT: Record<MessageKind, string> = {
  custom: "Your reminder",
  appointment_day_before: "Appointment reminder",
  appointment_morning_of: "Appointment reminder",
  booking_confirmation: "Booking confirmation",
  unpaid_bill: "Bill reminder",
  recall: "Check-up recall",
  staff_daily: "Doctor's day",
};
