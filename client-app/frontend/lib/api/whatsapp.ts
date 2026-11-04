import { json, request } from "./request";

/*
 * WhatsApp reminders: the API contract of /api/whatsapp/*.
 *
 *   GET/PUT/DELETE connection       the clinic's number (secrets never returned)
 *   POST connection/test            check with Meta, send hello_world to a number
 *   GET templates, PUT templates/:id, POST templates/submit, POST templates/refresh-status
 *   GET rules, PUT rules/:kind
 *   GET messages                    the paged log (usePagedList reads it directly)
 *   POST run                        send what is due now
 *   POST messages/:id/retry
 */

export type ConnectionStatus = "not_connected" | "unverified" | "connected" | "error";

export interface WhatsAppConnection {
  configured: boolean;
  display_phone: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  has_access_token: boolean;
  has_app_secret: boolean;
  default_country_code: string;
  default_language: MessageLanguage;
  status: ConnectionStatus;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_error: string | null;
  webhook_url: string | null;
  verify_token: string | null;
  dry_run: boolean;
}

export interface ConnectionInput {
  display_phone?: string;
  phone_number_id: string;
  waba_id: string;
  access_token?: string;
  app_secret?: string;
  default_country_code?: string;
  default_language?: MessageLanguage;
}

export interface TestResult {
  ok: boolean;
  display_phone: string | null;
  message: string;
  message_id?: string;
  code?: string;
  connection: WhatsAppConnection;
}

export type TemplateKind = "appointment_reminder" | "booking_confirmation" | "unpaid_bill" | "recall" | "staff_daily" | "custom" | "birthday";
export type MessageLanguage = "en" | "ar";
export type MetaStatus = "draft" | "pending" | "approved" | "rejected" | "paused";

export interface WhatsAppTemplate {
  id: number | string;
  kind: TemplateKind;
  language: MessageLanguage;
  meta_name: string;
  category: "UTILITY" | "MARKETING";
  body: string;
  meta_status: MetaStatus;
  meta_reason: string | null;
  submitted_at: string | null;
  status_checked_at: string | null;
  /** What each {{n}} stands for, in order. */
  params: string[];
  default_body: string;
  /** The clinic's own reminder this wording belongs to; null for a built-in kind. */
  custom_reminder_id: number | string | null;
}

/** What starts a reminder the clinic defines. */
export type CustomTrigger = "procedure" | "birthday";

/** A reminder the clinic defines: N days after a procedure on the chart, or on the patient's birthday. */
export interface CustomReminder {
  id: number | string;
  name: string;
  trigger: CustomTrigger;
  /** procedure trigger: the chart procedure it follows, or null for any. */
  procedure: string | null;
  /** procedure trigger: days after the treatment date; 0 for a birthday. */
  delay_days: number;
  at_time: string | null;
  skip_if_booked: boolean;
  enabled: boolean;
}

export interface CustomReminderInput {
  name: string;
  trigger?: CustomTrigger;
  procedure?: string | null;
  delay_days?: number;
  at_time?: string;
  skip_if_booked?: boolean;
  enabled?: boolean;
  /** The wording to start with (on create); the suggested one when omitted. */
  body_en?: string;
  body_ar?: string;
}

/** What the AI made of a sentence: the fields of the form plus a wording, nothing saved. */
export interface ReminderDraft {
  name: string;
  trigger: CustomTrigger;
  procedure: string | null;
  delay_days: number;
  at_time: string;
  skip_if_booked: boolean;
  body_en: string;
  body_ar: string;
  summary: string;
  /** Set when the wish needs something the system cannot do; the fields hold the closest it can. */
  unsupported?: string;
}

export type RuleKind =
  | "appointment_day_before"
  | "appointment_morning_of"
  | "booking_confirmation"
  | "unpaid_bill"
  | "recall"
  | "staff_daily";

export interface WhatsAppRule {
  id: number | string;
  kind: RuleKind;
  enabled: boolean;
  at_time: string | null;
  days_after_due: number | null;
  repeat_every_days: number | null;
  months_since_visit: number | null;
  max_per_run: number | null;
  /** The settings this kind uses. */
  fields: string[];
}

export interface RuleInput {
  enabled?: boolean;
  at_time?: string;
  days_after_due?: number;
  repeat_every_days?: number;
  months_since_visit?: number;
  max_per_run?: number;
}

export type MessageKind = RuleKind | "custom";

export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "skipped";

export interface WhatsAppMessage {
  id: number | string;
  kind: MessageKind;
  recipient_kind: "patient" | "staff";
  to_name: string | null;
  to_phone: string | null;
  patient_id: number | string | null;
  user_id: number | string | null;
  appointment_id: number | string | null;
  appointment_date: string | null;
  invoice_id: number | string | null;
  invoice_number: string | null;
  custom_reminder_id: number | string | null;
  custom_reminder_name: string | null;
  language: MessageLanguage | null;
  template_name: string | null;
  params: string[];
  status: MessageStatus;
  skip_reason: string | null;
  error_code: string | null;
  error: string | null;
  attempts: number;
  trigger: "cron" | "run" | "event" | "retry";
  scheduled_for: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
}

export interface RunResult {
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  duplicates: number;
  reason?: "not_connected";
}

export const fetchConnection = () => request<WhatsAppConnection>("/api/whatsapp/connection");
export const saveConnection = (input: ConnectionInput) =>
  request<WhatsAppConnection>("/api/whatsapp/connection", json("PUT", input));
export const disconnectWhatsApp = () =>
  request<WhatsAppConnection>("/api/whatsapp/connection", json("DELETE"));
export const testConnection = (to?: string) =>
  request<TestResult>("/api/whatsapp/connection/test", json("POST", to ? { to } : {}));

export const fetchTemplates = () => request<WhatsAppTemplate[]>("/api/whatsapp/templates");
export const saveTemplate = (id: number | string, body: string) =>
  request<WhatsAppTemplate>(`/api/whatsapp/templates/${id}`, json("PUT", { body }));
export const submitTemplates = (ids?: (number | string)[]) =>
  request<{
    results: { id: number | string; kind: TemplateKind; language: MessageLanguage; ok: boolean; message?: string }[];
    templates: WhatsAppTemplate[];
  }>("/api/whatsapp/templates/submit", json("POST", ids ? { ids: ids.map(Number) } : {}));
export const refreshTemplates = () =>
  request<WhatsAppTemplate[]>("/api/whatsapp/templates/refresh-status", json("POST", {}));

export const fetchRules = () => request<WhatsAppRule[]>("/api/whatsapp/rules");
export const saveRule = (kind: RuleKind, input: RuleInput) =>
  request<WhatsAppRule>(`/api/whatsapp/rules/${kind}`, json("PUT", input));

export const fetchCustomReminders = () => request<CustomReminder[]>("/api/whatsapp/custom-reminders");
export const createCustomReminder = (input: CustomReminderInput) =>
  request<CustomReminder>("/api/whatsapp/custom-reminders", json("POST", input));
export const updateCustomReminder = (id: number | string, input: Partial<CustomReminderInput>) =>
  request<CustomReminder>(`/api/whatsapp/custom-reminders/${id}`, json("PUT", input));
export const deleteCustomReminder = (id: number | string) =>
  request<{ deleted: true }>(`/api/whatsapp/custom-reminders/${id}`, json("DELETE"));
export const draftCustomReminder = (text: string) =>
  request<ReminderDraft>("/api/whatsapp/custom-reminders/draft", json("POST", { text }));

export const runNow = () => request<RunResult>("/api/whatsapp/run", json("POST", {}));
export const retryMessage = (id: number | string) =>
  request<WhatsAppMessage>(`/api/whatsapp/messages/${id}/retry`, json("POST", {}));
