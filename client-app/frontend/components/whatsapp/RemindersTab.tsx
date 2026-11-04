"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FaCheck, FaChevronDown, FaMagic, FaPaperPlane, FaPlus, FaSyncAlt, FaTimes, FaTrash, FaUndo } from "react-icons/fa";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { FormField, inputClass } from "@/components/ui/FormField";
import { Switch } from "@/components/ui/Switch";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { PROCEDURES } from "@/components/billing/invoice-doc";
import { cn, formatDateBeirut } from "@/lib/utils";
import { useClinicIdentity } from "@/lib/clinic";
import { errorText } from "@/lib/api/request";
import {
  createCustomReminder,
  deleteCustomReminder,
  draftCustomReminder,
  refreshTemplates,
  saveRule,
  saveTemplate,
  submitTemplates,
  updateCustomReminder,
  type CustomReminder,
  type CustomReminderInput,
  type DateField,
  type MessageLanguage,
  type RuleDefinition,
  type RuleFilters,
  type RuleTrigger,
  type TriggerType,
  type RuleInput,
  type RuleKind,
  type RunResult,
  type TemplateKind,
  type WhatsAppRule,
  type WhatsAppTemplate,
} from "@/lib/api/whatsapp";
import type { WhatsAppFile } from "./useWhatsApp";
import {
  BODY_MAX,
  CARD_KINDS,
  KIND_DESCRIPTION,
  KIND_RECIPIENTS,
  KIND_TITLE,
  META_STATUS_LABEL,
  META_STATUS_MEANING,
  META_STATUS_TONE,
  PLACEHOLDER_LABEL,
  REJECTION_REASONS,
  RULE_TITLE,
  RULES_OF_CARD,
  DATE_FIELD_TITLE,
  EMPTY_FILTERS,
  MONTHS,
  TRIGGER_HINT,
  TRIGGER_TITLE,
  WEEKDAYS,
  paramsOfRule,
  recipientsOfRule,
  renderPreview,
  validateBody,
} from "./whatsapp-words";

/*
 * What goes out, when, in which words: one card per reminder kind, with its
 * on/off switches and timing on top and the English and Arabic wording
 * underneath, each with Meta's verdict. Nothing here sends; "Send what is
 * due now" sits above the cards and in the header.
 */

interface Props {
  file: WhatsAppFile;
  canEdit: boolean;
  canSend: boolean;
  running: boolean;
  lastRun: { at: Date; result: RunResult } | null;
  onRun: () => void;
  onTemplates: (t: WhatsAppTemplate[]) => void;
  onTemplate: (t: WhatsAppTemplate) => void;
  onRule: (r: WhatsAppRule) => void;
  onConnect: () => void;
  onSeeFailed: () => void;
  customReminders: CustomReminder[];
  onCustomReminders: (list: CustomReminder[]) => void;
  /** Re-read templates after a custom reminder is created or removed. */
  onReloadTemplates: () => void;
}

export function RemindersTab({ file, canEdit, canSend, running, lastRun, onRun, onTemplates, onTemplate, onRule, onConnect, onSeeFailed, customReminders, onCustomReminders, onReloadTemplates }: Props) {
  const connected = file.connection.status === "connected";
  const drafts = file.templates.filter((t) => t.meta_status === "draft" || t.meta_status === "rejected");
  const pending = file.templates.filter((t) => t.meta_status === "pending");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState<TemplateKind | null>(() => (file.rules.some((r) => r.enabled) ? null : "appointment_reminder"));
  const [editing, setEditing] = useState<CustomReminder | "new" | null>(null);

  const submitAll = async () => {
    setSubmitting(true);
    try {
      const r = await submitTemplates();
      onTemplates(r.templates);
      const refused = r.results.filter((x) => !x.ok);
      if (refused.length === 0) toast.success(`${r.results.length} wording${r.results.length === 1 ? "" : "s"} sent to WhatsApp for approval.`);
      else toast.error(`${refused.length} wording${refused.length === 1 ? " was" : "s were"} refused: ${refused[0].message}`);
    } catch (err) {
      toast.error(errorText(err, "Could not submit to WhatsApp."));
    } finally {
      setSubmitting(false);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      const before = new Map(file.templates.map((t) => [String(t.id), t.meta_status]));
      const templates = await refreshTemplates();
      onTemplates(templates);
      for (const t of templates) {
        const was = before.get(String(t.id));
        if (was === "pending" && t.meta_status === "approved") toast.success(`${KIND_TITLE[t.kind]} (${t.language === "ar" ? "Arabic" : "English"}) approved.`);
        if (was === "pending" && t.meta_status === "rejected") toast.error(`${KIND_TITLE[t.kind]} (${t.language === "ar" ? "Arabic" : "English"}) rejected${t.meta_reason ? `: ${t.meta_reason}` : "."}`);
      }
    } catch (err) {
      toast.error(errorText(err, "Could not check with WhatsApp."));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium text-ink-900">Reminders go out by themselves at the times below.</div>
          <div className="text-ink-600">
            <strong>Send what is due now</strong> sends anything due at this moment, for example after switching a reminder on.
            {lastRun && (
              <>
                {" "}
                Last run {formatDateBeirut(lastRun.at.toISOString())}: {lastRun.result.sent} sent
                {lastRun.result.failed > 0 && (
                  <>
                    , {lastRun.result.failed} failed (
                    <button type="button" className="underline" onClick={onSeeFailed}>
                      see Messages
                    </button>
                    )
                  </>
                )}
                {lastRun.result.skipped > 0 && `, ${lastRun.result.skipped} skipped`}.
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
              <FaPlus className="me-2" /> Add a reminder
            </Button>
          )}
          {canSend && (
            <Button size="sm" onClick={onRun} disabled={running || !connected}>
              <FaPaperPlane className="me-2" />
              {running ? "Sending…" : "Send what is due now"}
            </Button>
          )}
        </div>
      </div>

      {!connected && (
        <p className="rounded-xl bg-honey-50 px-3 py-2 text-sm text-honey-800 ring-1 ring-inset ring-honey-200">
          Not connected yet. You can prepare the wording and the schedule now; nothing is sent until the number is connected.{" "}
          <button type="button" className="font-medium underline" onClick={onConnect}>
            Connect the number
          </button>
        </p>
      )}

      {canEdit && (drafts.length > 0 || pending.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
          {drafts.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => void submitAll()} disabled={submitting || !connected} title={connected ? undefined : "Connect the number first"}>
              <FaPaperPlane className="me-2" />
              {submitting ? "Submitting…" : `Submit ${drafts.length} wording${drafts.length === 1 ? "" : "s"} to WhatsApp`}
            </Button>
          )}
          {pending.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => void check()} disabled={checking}>
              <FaSyncAlt className={cn("me-2", checking && "animate-spin")} />
              {pending.length} waiting for WhatsApp · check now
            </Button>
          )}
        </div>
      )}

      {CARD_KINDS.map((kind) => (
        <ReminderKindCard
          key={kind}
          kind={kind}
          rules={file.rules.filter((r) => RULES_OF_CARD[kind].includes(r.kind))}
          templates={file.templates.filter((t) => t.kind === kind && t.custom_reminder_id == null)}
          connected={connected}
          canEdit={canEdit}
          open={open === kind}
          onToggle={() => setOpen((o) => (o === kind ? null : kind))}
          onRule={onRule}
          onTemplate={onTemplate}
          onTemplates={onTemplates}
        />
      ))}

      <CustomRemindersSection
        reminders={customReminders}
        templates={file.templates.filter((t) => t.custom_reminder_id != null)}
        connected={connected}
        canEdit={canEdit}
        onChange={onCustomReminders}
        onTemplate={onTemplate}
        onTemplates={onTemplates}
        onReloadTemplates={onReloadTemplates}
        editing={editing}
        onEdit={setEditing}
      />
    </div>
  );
}

// ── The clinic's own reminders ────────────────────────────────────────────

const UNITS = [
  ["days", 1],
  ["weeks", 7],
  ["months", 30],
] as const;
type Unit = (typeof UNITS)[number][0];

/** "7 days" / "2 weeks" / "6 months" from a number of days. */
function splitDelay(days: number): { amount: number; unit: Unit } {
  if (days % 30 === 0 && days >= 30) return { amount: days / 30, unit: "months" };
  if (days % 7 === 0 && days >= 7) return { amount: days / 7, unit: "weeks" };
  return { amount: days, unit: "days" };
}

function CustomRemindersSection({
  reminders,
  templates,
  connected,
  canEdit,
  onChange,
  onTemplate,
  onTemplates,
  onReloadTemplates,
  editing,
  onEdit,
}: {
  reminders: CustomReminder[];
  templates: WhatsAppTemplate[];
  connected: boolean;
  canEdit: boolean;
  onChange: (list: CustomReminder[]) => void;
  onTemplate: (t: WhatsAppTemplate) => void;
  onTemplates: (t: WhatsAppTemplate[]) => void;
  onReloadTemplates: () => void;
  /** The reminder being edited, "new" for one being added (the + button is in the bar above). */
  editing: CustomReminder | "new" | null;
  onEdit: (e: CustomReminder | "new" | null) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const remove = async (r: CustomReminder) => {
    if (!window.confirm(`Remove "${r.name}"? Messages already sent stay in the log.`)) return;
    try {
      await deleteCustomReminder(r.id);
      onChange(reminders.filter((x) => String(x.id) !== String(r.id)));
      onReloadTemplates();
      toast.success("Reminder removed.");
    } catch (err) {
      toast.error(errorText(err, "Could not remove it."));
    }
  };

  const toggle = async (r: CustomReminder, enabled: boolean) => {
    onChange(reminders.map((x) => (String(x.id) === String(r.id) ? { ...x, enabled } : x)));
    try {
      const saved = await updateCustomReminder(r.id, { enabled });
      onChange(reminders.map((x) => (String(x.id) === String(r.id) ? saved : x)));
    } catch (err) {
      onChange(reminders);
      toast.error(errorText(err, "Could not save."));
    }
  };

  return (
    <section className="space-y-3">
      <div className="pt-2">
        <h3 className="text-sm font-semibold text-ink-900">Your own reminders</h3>
        <p className="text-xs text-ink-500">
          A rule from parts: when (after a procedure, around an appointment, since the last visit, a date on the file, a bill, a
          calendar date), who (the patients it concerns, narrowed by procedure, age, language, money owed, bookings or last visit, or
          the doctors) and what (your words). Describe it in a sentence and the assistant fills the parts; you check and save.
        </p>
      </div>

      {reminders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-500">
          No reminders of your own yet.{canEdit ? " Use “Add a reminder” above." : ""}
        </p>
      ) : (
        reminders.map((r) => {
          const mine = templates.filter((t) => String(t.custom_reminder_id) === String(r.id));
          const en = mine.find((t) => t.language === "en")?.meta_status;
          const ar = mine.find((t) => t.language === "ar")?.meta_status;
          const ready = !r.enabled
            ? { tone: "neutral" as const, text: "Switched off." }
            : !connected
              ? { tone: "honey" as const, text: "On, but nothing is sent until the number is connected." }
              : en === "approved" || ar === "approved"
                ? { tone: "leaf" as const, text: en === "approved" && ar === "approved" ? "Ready: sends in English and Arabic." : "Ready in one language; the other is not approved yet." }
                : { tone: "brick" as const, text: "Nothing will be sent: no approved wording yet. Submit the wording to WhatsApp." };
          const isOpen = open === String(r.id);
          return (
            <section key={String(r.id)} className="overflow-hidden rounded-2xl border border-ink-200 bg-card">
              <div className="flex items-start gap-3 px-4 py-3">
                <Switch checked={r.enabled} onChange={(next) => void toggle(r, next)} disabled={!canEdit} label={r.name} size="sm" />
                <button type="button" onClick={() => setOpen(isOpen ? null : String(r.id))} className="min-w-0 flex-1 text-start" aria-expanded={isOpen}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ink-700">
                      {r.summary}
                      {r.at_time ? `, at ${r.at_time}` : ""}
                    </span>
                    <Badge tone={ready.tone} dot size="sm">
                      {r.enabled ? (ready.tone === "leaf" ? "Ready" : ready.tone === "honey" ? "Partly ready" : "Not ready") : "Off"}
                    </Badge>
                  </span>
                </button>
                {canEdit && (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>
                      Edit
                    </Button>
                    <button type="button" onClick={() => void remove(r)} className="press rounded-lg p-2 text-ink-400 hover:bg-brick-50 hover:text-brick-700" aria-label="Remove">
                      <FaTrash className="text-xs" />
                    </button>
                  </span>
                )}
                <button type="button" onClick={() => setOpen(isOpen ? null : String(r.id))} className="p-1 text-ink-400" aria-label={isOpen ? "Collapse" : "Expand"}>
                  <FaChevronDown className={cn("size-3 transition-transform", isOpen && "rotate-180")} aria-hidden />
                </button>
              </div>
              {isOpen && (
                <div className="space-y-4 border-t border-ink-100 px-4 py-4">
                  <p className={cn("rounded-xl px-3 py-2 text-xs font-medium ring-1 ring-inset", ready.tone === "leaf" && "bg-leaf-50 text-leaf-800 ring-leaf-200", ready.tone === "honey" && "bg-honey-50 text-honey-800 ring-honey-200", ready.tone === "brick" && "bg-brick-50 text-brick-800 ring-brick-200", ready.tone === "neutral" && "bg-ink-50 text-ink-600 ring-ink-200")}>
                    {ready.text}
                  </p>
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Who receives it</h4>
                    <p className="text-sm text-ink-700">{recipientsOfRule(r.definition)}</p>
                  </div>
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Wording</h4>
                    <TemplateEditor templates={mine} canEdit={canEdit} connected={connected} onTemplate={onTemplate} onTemplates={onTemplates} />
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}

      {editing && (
        <CustomReminderModal
          reminder={editing === "new" ? null : editing}
          onClose={() => onEdit(null)}
          onSaved={(saved, created) => {
            onChange(created ? [...reminders, saved] : reminders.map((x) => (String(x.id) === String(saved.id) ? saved : x)));
            if (created) {
              onReloadTemplates();
              setOpen(String(saved.id));
            }
            onEdit(null);
          }}
        />
      )}
    </section>
  );
}

// ── The form: a sentence, or the parts by hand ────────────────────────────

type Span = { amount: number; unit: Unit };
const spanOf = (days: number): Span => splitDelay(Math.max(1, days));
const daysOf = (s: Span) => Math.max(1, Math.round(s.amount)) * (UNITS.find(([u]) => u === s.unit)?.[1] ?? 1);
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

/** The trigger as the form holds it: every type's fields at once, so switching type keeps what was typed. */
interface TriggerForm {
  type: TriggerType;
  procedure: string;
  after: Span;
  when: "before" | "after";
  apptDays: string;
  sinceVisit: Span;
  repeatVisit: string;
  field: DateField;
  offsetDir: "on" | "before" | "after";
  offsetDays: string;
  overdue: string;
  repeatBill: string;
  month: number;
  day: string;
  weekday: number;
  date: string;
}

const CALENDAR: TriggerType[] = ["yearly", "monthly", "weekly", "once"];

function triggerForm(t?: RuleTrigger): TriggerForm {
  const f: TriggerForm = {
    type: "procedure",
    procedure: "",
    after: { amount: 7, unit: "days" },
    when: "before",
    apptDays: "1",
    sinceVisit: { amount: 6, unit: "months" },
    repeatVisit: "",
    field: "birthday",
    offsetDir: "on",
    offsetDays: "7",
    overdue: "3",
    repeatBill: "7",
    month: 1,
    day: "1",
    weekday: 1,
    date: new Date().toISOString().slice(0, 10),
  };
  if (!t) return f;
  f.type = t.type;
  switch (t.type) {
    case "procedure":
      f.procedure = t.procedure ?? "";
      f.after = spanOf(t.days_after);
      break;
    case "appointment":
      f.when = t.when;
      f.apptDays = String(t.days);
      break;
    case "since_last_visit":
      f.sinceVisit = spanOf(t.days);
      f.repeatVisit = t.repeat_every_days ? String(t.repeat_every_days) : "";
      break;
    case "date_on_file":
      f.field = t.field;
      f.offsetDir = t.days_offset === 0 ? "on" : t.days_offset < 0 ? "before" : "after";
      f.offsetDays = String(Math.abs(t.days_offset) || 7);
      break;
    case "unpaid_bill":
      f.overdue = String(t.days_overdue);
      f.repeatBill = t.repeat_every_days ? String(t.repeat_every_days) : "";
      break;
    case "yearly":
      f.month = t.month;
      f.day = String(t.day);
      break;
    case "monthly":
      f.day = String(t.day);
      break;
    case "weekly":
      f.weekday = t.weekday;
      break;
    case "once":
      f.date = t.date;
      break;
  }
  return f;
}

function triggerOf(f: TriggerForm): RuleTrigger {
  switch (f.type) {
    case "procedure":
      return { type: "procedure", procedure: f.procedure || null, days_after: daysOf(f.after) };
    case "appointment":
      return { type: "appointment", when: f.when, days: Number(f.apptDays) };
    case "since_last_visit":
      return { type: "since_last_visit", days: daysOf(f.sinceVisit), repeat_every_days: numOrNull(f.repeatVisit) };
    case "date_on_file":
      return {
        type: "date_on_file",
        field: f.field,
        days_offset: f.offsetDir === "on" ? 0 : (f.offsetDir === "before" ? -1 : 1) * Number(f.offsetDays),
      };
    case "unpaid_bill":
      return { type: "unpaid_bill", days_overdue: Number(f.overdue), repeat_every_days: numOrNull(f.repeatBill) };
    case "yearly":
      return { type: "yearly", month: f.month, day: Number(f.day) };
    case "monthly":
      return { type: "monthly", day: Number(f.day) };
    case "weekly":
      return { type: "weekly", weekday: f.weekday };
    case "once":
      return { type: "once", date: f.date };
  }
}

/** The conditions the form shows as rows; each one is a group of filter fields. */
type Condition = "procedures" | "age" | "languages" | "owes_money" | "skip_if_booked" | "seen";
const CONDITION_TITLE: Record<Condition, string> = {
  procedures: "Had a procedure",
  age: "Age",
  languages: "Language",
  owes_money: "Money owed",
  skip_if_booked: "Skip if already booked",
  seen: "Last seen",
};
function conditionsOf(f: RuleFilters): Condition[] {
  const out: Condition[] = [];
  if (f.procedures.length) out.push("procedures");
  if (f.min_age !== null || f.max_age !== null) out.push("age");
  if (f.languages.length) out.push("languages");
  if (f.owes_money !== null) out.push("owes_money");
  if (f.skip_if_booked) out.push("skip_if_booked");
  if (f.seen_within_months !== null || f.not_seen_for_months !== null) out.push("seen");
  return out;
}

function CustomReminderModal({
  reminder,
  onClose,
  onSaved,
}: {
  reminder: CustomReminder | null;
  onClose: () => void;
  onSaved: (saved: CustomReminder, created: boolean) => void;
}) {
  const [name, setName] = useState(reminder?.name ?? "");
  const [trigger, setTrigger] = useState<TriggerForm>(() => triggerForm(reminder?.definition.trigger));
  const [audience, setAudience] = useState<"patients" | "staff">(reminder?.definition.audience ?? "patients");
  const [filters, setFilters] = useState<RuleFilters>(() => ({ ...EMPTY_FILTERS, ...(reminder?.definition.filters ?? {}) }));
  const [conditions, setConditions] = useState<Condition[]>(() => conditionsOf(reminder?.definition.filters ?? EMPTY_FILTERS));
  const [seenMode, setSeenMode] = useState<"within" | "not_for">(reminder?.definition.filters.not_seen_for_months ? "not_for" : "within");
  const [atTime, setAtTime] = useState(reminder?.at_time ?? "10:00");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [wish, setWish] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<{ tone: "leaf" | "honey"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isCalendar = CALENDAR.includes(trigger.type);
  const effectiveAudience = isCalendar ? audience : "patients";
  const definition: RuleDefinition = {
    trigger: triggerOf(trigger),
    audience: effectiveAudience,
    filters: effectiveAudience === "staff" ? EMPTY_FILTERS : filters,
  };
  const params = paramsOfRule(definition);
  const enCheck = bodyEn.trim() ? validateBody(bodyEn, params) : {};
  const arCheck = bodyAr.trim() ? validateBody(bodyAr, params) : {};
  const setT = (patch: Partial<TriggerForm>) => setTrigger((t) => ({ ...t, ...patch }));
  const setF = (patch: Partial<RuleFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const addCondition = (c: Condition) => {
    if (!c || conditions.includes(c)) return;
    setConditions((list) => [...list, c]);
    if (c === "skip_if_booked") setF({ skip_if_booked: true });
    if (c === "owes_money") setF({ owes_money: true });
    if (c === "seen") setF({ seen_within_months: 12, not_seen_for_months: null });
  };
  const removeCondition = (c: Condition) => {
    setConditions((list) => list.filter((x) => x !== c));
    if (c === "procedures") setF({ procedures: [], procedures_within_months: null });
    if (c === "age") setF({ min_age: null, max_age: null });
    if (c === "languages") setF({ languages: [] });
    if (c === "owes_money") setF({ owes_money: null });
    if (c === "skip_if_booked") setF({ skip_if_booked: false });
    if (c === "seen") setF({ seen_within_months: null, not_seen_for_months: null });
  };

  /** One sentence in, the whole form out; the admin still reads it and presses Add. */
  const draft = async () => {
    if (wish.trim().length < 5) return setError("Describe the reminder in a few words first.");
    setError("");
    setDraftNote(null);
    setDrafting(true);
    try {
      const d = await draftCustomReminder(wish);
      setName(d.name);
      setTrigger(triggerForm(d.definition.trigger));
      setAudience(d.definition.audience);
      setFilters({ ...EMPTY_FILTERS, ...d.definition.filters });
      setConditions(conditionsOf(d.definition.filters));
      setSeenMode(d.definition.filters.not_seen_for_months ? "not_for" : "within");
      setAtTime(d.at_time);
      setBodyEn(d.body_en);
      setBodyAr(d.body_ar);
      setDraftNote(
        d.unsupported
          ? { tone: "honey", text: `${d.unsupported} Filled in: ${d.summary}.` }
          : { tone: "leaf", text: `Understood as: ${d.summary}. Check the parts below, change anything, then add it.` },
      );
    } catch (err) {
      setError(errorText(err, "The assistant could not draft it; fill the form by hand."));
    } finally {
      setDrafting(false);
    }
  };

  const save = async () => {
    setError("");
    if (!name.trim()) return setError("Give the reminder a name.");
    if (enCheck.error) return setError(`English wording: ${enCheck.error}`);
    if (arCheck.error) return setError(`Arabic wording: ${arCheck.error}`);
    const input: CustomReminderInput = { name: name.trim(), definition, at_time: atTime || "10:00" };
    setSaving(true);
    try {
      const saved = reminder
        ? await updateCustomReminder(reminder.id, input)
        : await createCustomReminder({
            ...input,
            enabled: true,
            ...(bodyEn.trim() ? { body_en: bodyEn.trim() } : {}),
            ...(bodyAr.trim() ? { body_ar: bodyAr.trim() } : {}),
          });
      if (reminder && saved.wording_reset) toast.info("The reminder now fills different placeholders, so its wording starts again from the suggested one. Check it and submit it to WhatsApp.");
      toast.success(reminder ? "Reminder saved." : "Reminder added. Now check its wording and submit it to WhatsApp.");
      onSaved(saved, !reminder);
    } catch (err) {
      setError(errorText(err, "Could not save the reminder."));
    } finally {
      setSaving(false);
    }
  };

  const placeholderHint = params.map((p, i) => `{{${i + 1}}} ${PLACEHOLDER_LABEL[p]?.toLowerCase() ?? p}`).join(" · ");
  const num = (v: string | number, min: number, max: number, onChange: (s: string) => void, width = "w-20") => (
    <input type="number" min={min} max={max} value={v} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, width)} />
  );
  const span = (s: Span, onChange: (s: Span) => void) => (
    <span className="inline-flex items-center gap-2">
      {num(s.amount, 1, 999, (v) => onChange({ ...s, amount: Number(v) }))}
      <select value={s.unit} onChange={(e) => onChange({ ...s, unit: e.target.value as Unit })} className={cn(inputClass, "w-28")}>
        {UNITS.map(([u]) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </span>
  );
  const row = (children: React.ReactNode) => <div className="flex flex-wrap items-center gap-2 text-sm text-ink-700">{children}</div>;

  return (
    <Modal
      isOpen
      onClose={() => !saving && onClose()}
      title={reminder ? "Edit the reminder" : "A reminder of your own"}
      description={reminder ? "Change any part. If the new parts fill different placeholders, the wording starts again from the suggested one." : "Say it in a sentence and let the assistant fill the parts, or fill them yourself."}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || drafting}>
            {saving ? "Saving…" : reminder ? "Save" : "Add reminder"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {!reminder && (
          <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-800" htmlFor="reminder-wish">
              Describe it in your words
            </label>
            <textarea
              id="reminder-wish"
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              rows={2}
              className={cn(inputClass, "resize-y")}
              placeholder="Three months after every implant for patients over 60, unless they already booked · A gift a week before their birthday · Every Monday, remind the doctors to check the stock"
              autoFocus
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-500">Drafting sends and saves nothing; you check the parts below.</span>
              <Button size="sm" variant="outline" onClick={() => void draft()} disabled={drafting || wish.trim().length < 5}>
                <FaMagic className="me-2" />
                {drafting ? "Drafting…" : "Draft it for me"}
              </Button>
            </div>
            {draftNote && (
              <p className={cn("mt-2 rounded-lg px-3 py-2 text-xs ring-1 ring-inset", draftNote.tone === "leaf" ? "bg-leaf-50 text-leaf-800 ring-leaf-200" : "bg-honey-50 text-honey-800 ring-honey-200")}>
                {draftNote.text}
              </p>
            )}
          </div>
        )}

        <FormField label="Name" required hint="For your own eyes, e.g. After root canal">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </FormField>

        {/* ── When ── */}
        <section className="space-y-3 rounded-2xl border border-ink-200 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">When</h4>
            <select value={trigger.type} onChange={(e) => setT({ type: e.target.value as TriggerType })} className={cn(inputClass, "max-w-xs")}>
              {(Object.keys(TRIGGER_TITLE) as TriggerType[]).map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_TITLE[t]}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-ink-500">{TRIGGER_HINT[trigger.type]}</p>
          {trigger.type === "procedure" &&
            row(
              <>
                {span(trigger.after, (after) => setT({ after }))}
                <span>after</span>
                <select value={trigger.procedure} onChange={(e) => setT({ procedure: e.target.value })} className={cn(inputClass, "max-w-xs")}>
                  <option value="">any procedure</option>
                  {PROCEDURES.map((p) => (
                    <option key={p} value={p}>
                      every {p.toLowerCase()}
                    </option>
                  ))}
                </select>
              </>,
            )}
          {trigger.type === "appointment" &&
            row(
              <>
                {num(trigger.apptDays, 0, 365, (apptDays) => setT({ apptDays }))}
                <span>day(s)</span>
                <select value={trigger.when} onChange={(e) => setT({ when: e.target.value as "before" | "after" })} className={cn(inputClass, "w-40")}>
                  <option value="before">before an appointment</option>
                  <option value="after">after a visit</option>
                </select>
              </>,
            )}
          {trigger.type === "since_last_visit" &&
            row(
              <>
                {span(trigger.sinceVisit, (sinceVisit) => setT({ sinceVisit }))}
                <span>after the last visit, then again every</span>
                {num(trigger.repeatVisit, 1, 365, (repeatVisit) => setT({ repeatVisit }))}
                <span>day(s) (empty: once)</span>
              </>,
            )}
          {trigger.type === "date_on_file" &&
            row(
              <>
                <select value={trigger.offsetDir} onChange={(e) => setT({ offsetDir: e.target.value as TriggerForm["offsetDir"] })} className={cn(inputClass, "w-28")}>
                  <option value="on">On</option>
                  <option value="before">Before</option>
                  <option value="after">After</option>
                </select>
                {trigger.offsetDir !== "on" && (
                  <>
                    {num(trigger.offsetDays, 1, 60, (offsetDays) => setT({ offsetDays }))}
                    <span>day(s) {trigger.offsetDir}</span>
                  </>
                )}
                <select value={trigger.field} onChange={(e) => setT({ field: e.target.value as DateField })} className={cn(inputClass, "w-44")}>
                  {(Object.keys(DATE_FIELD_TITLE) as DateField[]).map((d) => (
                    <option key={d} value={d}>
                      {DATE_FIELD_TITLE[d]}
                    </option>
                  ))}
                </select>
                <span>, every year</span>
              </>,
            )}
          {trigger.type === "unpaid_bill" &&
            row(
              <>
                <span>When a bill is</span>
                {num(trigger.overdue, 0, 365, (overdue) => setT({ overdue }))}
                <span>day(s) overdue, then again every</span>
                {num(trigger.repeatBill, 1, 365, (repeatBill) => setT({ repeatBill }))}
                <span>day(s) (empty: once)</span>
              </>,
            )}
          {trigger.type === "yearly" &&
            row(
              <>
                <span>Every year on</span>
                {num(trigger.day, 1, 31, (day) => setT({ day }))}
                <select value={trigger.month} onChange={(e) => setT({ month: Number(e.target.value) })} className={cn(inputClass, "w-36")}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </>,
            )}
          {trigger.type === "monthly" &&
            row(
              <>
                <span>On day</span>
                {num(trigger.day, 1, 28, (day) => setT({ day }))}
                <span>of every month</span>
              </>,
            )}
          {trigger.type === "weekly" &&
            row(
              <>
                <span>Every</span>
                <select value={trigger.weekday} onChange={(e) => setT({ weekday: Number(e.target.value) })} className={cn(inputClass, "w-36")}>
                  {WEEKDAYS.map((w, i) => (
                    <option key={w} value={i}>
                      {w}
                    </option>
                  ))}
                </select>
              </>,
            )}
          {trigger.type === "once" &&
            row(
              <>
                <span>Once, on</span>
                <input type="date" value={trigger.date} onChange={(e) => setT({ date: e.target.value })} className={cn(inputClass, "w-44")} />
              </>,
            )}
          {row(
            <>
              <span>at</span>
              <input type="time" value={atTime} onChange={(e) => setAtTime(e.target.value)} className={cn(inputClass, "w-32")} />
              <span className="text-ink-500">clinic time</span>
            </>,
          )}
        </section>

        {/* ── Who ── */}
        <section className="space-y-3 rounded-2xl border border-ink-200 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Who</h4>
            {isCalendar ? (
              <select value={audience} onChange={(e) => setAudience(e.target.value as "patients" | "staff")} className={cn(inputClass, "max-w-xs")}>
                <option value="patients">Patients</option>
                <option value="staff">The doctors</option>
              </select>
            ) : (
              <span className="text-sm text-ink-700">The patients it concerns</span>
            )}
          </div>
          {effectiveAudience === "staff" ? (
            <p className="text-xs text-ink-500">Every doctor with a mobile number on their account, in the clinic&apos;s language.</p>
          ) : (
            <>
              {conditions.map((c) => (
                <div key={c} className="flex flex-wrap items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-700">
                  <span className="font-medium text-ink-900">{CONDITION_TITLE[c]}:</span>
                  {c === "procedures" && (
                    <>
                      <span className="flex flex-wrap gap-1">
                        {PROCEDURES.map((p) => {
                          const on = filters.procedures.includes(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setF({ procedures: on ? filters.procedures.filter((x) => x !== p) : [...filters.procedures, p] })}
                              className={cn("press rounded-full border px-2 py-0.5 text-xs", on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-card text-ink-600")}
                              aria-pressed={on}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </span>
                      <span>in the last</span>
                      {num(filters.procedures_within_months ?? "", 1, 240, (v) => setF({ procedures_within_months: numOrNull(v) }))}
                      <span>months (empty: ever)</span>
                    </>
                  )}
                  {c === "age" && (
                    <>
                      <span>from</span>
                      {num(filters.min_age ?? "", 0, 120, (v) => setF({ min_age: numOrNull(v) }))}
                      <span>to</span>
                      {num(filters.max_age ?? "", 0, 120, (v) => setF({ max_age: numOrNull(v) }))}
                      <span>years (either may be empty)</span>
                    </>
                  )}
                  {c === "languages" &&
                    (["en", "ar", "fr"] as const).map((l) => {
                      const on = filters.languages.includes(l);
                      return (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setF({ languages: on ? filters.languages.filter((x) => x !== l) : [...filters.languages, l] })}
                          className={cn("press rounded-full border px-2 py-0.5 text-xs", on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-card text-ink-600")}
                          aria-pressed={on}
                        >
                          {{ en: "English", ar: "Arabic", fr: "French" }[l]}
                        </button>
                      );
                    })}
                  {c === "owes_money" && (
                    <select value={filters.owes_money ? "yes" : "no"} onChange={(e) => setF({ owes_money: e.target.value === "yes" })} className={cn(inputClass, "w-48")}>
                      <option value="yes">only patients who owe money</option>
                      <option value="no">only patients who owe nothing</option>
                    </select>
                  )}
                  {c === "skip_if_booked" && <span>patients with an appointment already booked are left out</span>}
                  {c === "seen" && (
                    <>
                      <select
                        value={seenMode}
                        onChange={(e) => {
                          const mode = e.target.value as "within" | "not_for";
                          setSeenMode(mode);
                          const n = filters.seen_within_months ?? filters.not_seen_for_months ?? 12;
                          setF(mode === "within" ? { seen_within_months: n, not_seen_for_months: null } : { seen_within_months: null, not_seen_for_months: n });
                        }}
                        className={cn(inputClass, "w-44")}
                      >
                        <option value="within">seen in the last</option>
                        <option value="not_for">not seen for</option>
                      </select>
                      {num(
                        (seenMode === "within" ? filters.seen_within_months : filters.not_seen_for_months) ?? "",
                        1,
                        240,
                        (v) => setF(seenMode === "within" ? { seen_within_months: numOrNull(v) } : { not_seen_for_months: numOrNull(v) }),
                      )}
                      <span>months</span>
                    </>
                  )}
                  <button type="button" onClick={() => removeCondition(c)} className="ms-auto press rounded-lg p-1 text-ink-400 hover:bg-brick-50 hover:text-brick-700" aria-label={`Remove ${CONDITION_TITLE[c]}`}>
                    <FaTimes className="text-xs" />
                  </button>
                </div>
              ))}
              <select value="" onChange={(e) => addCondition(e.target.value as Condition)} className={cn(inputClass, "max-w-xs")} aria-label="Add a condition">
                <option value="">+ Add a condition…</option>
                {(Object.keys(CONDITION_TITLE) as Condition[])
                  .filter((c) => !conditions.includes(c))
                  .map((c) => (
                    <option key={c} value={c}>
                      {CONDITION_TITLE[c]}
                    </option>
                  ))}
              </select>
              {conditions.length === 0 && <p className="text-xs text-ink-500">Every patient the trigger concerns. Patients who asked for no WhatsApp are always skipped.</p>}
            </>
          )}
        </section>

        {/* ── What ── */}
        {!reminder && (
          <section className="space-y-3 rounded-2xl border border-ink-200 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">What</h4>
            <p className="text-xs text-ink-500">
              Leave empty to start from the suggested wording; you can edit, preview and submit it to WhatsApp after adding. Placeholders for this trigger:{" "}
              {placeholderHint}.
            </p>
            <FormField label="English" error={enCheck.error} hint={enCheck.warning}>
              <textarea value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} rows={3} className={cn(inputClass, "resize-y", enCheck.error && "border-brick-400")} maxLength={BODY_MAX} />
            </FormField>
            <FormField label="العربية" error={arCheck.error} hint={arCheck.warning}>
              <textarea value={bodyAr} onChange={(e) => setBodyAr(e.target.value)} rows={3} dir="rtl" className={cn(inputClass, "resize-y", arCheck.error && "border-brick-400")} maxLength={BODY_MAX} />
            </FormField>
          </section>
        )}

        {error && <p className="rounded-lg border border-brick-200 bg-brick-50 px-3 py-2 text-sm text-brick-800">{error}</p>}
      </div>
    </Modal>
  );
}

// ── One reminder kind ─────────────────────────────────────────────────────

function readiness(rules: WhatsAppRule[], templates: WhatsAppTemplate[], connected: boolean) {
  const on = rules.some((r) => r.enabled);
  const en = templates.find((t) => t.language === "en")?.meta_status;
  const ar = templates.find((t) => t.language === "ar")?.meta_status;
  if (!on) return { tone: "neutral" as const, text: "Switched off." };
  if (!connected) return { tone: "honey" as const, text: "On, but nothing is sent until the number is connected." };
  if (en === "approved" && ar === "approved") return { tone: "leaf" as const, text: "Ready: sends in English and Arabic." };
  if (en === "approved") return { tone: "honey" as const, text: `English ready. Arabic ${ar === "pending" ? "is waiting for WhatsApp" : "is not approved"}; Arabic speakers get the English wording meanwhile.` };
  if (ar === "approved") return { tone: "honey" as const, text: `Arabic ready. English ${en === "pending" ? "is waiting for WhatsApp" : "is not approved"}; English speakers get the Arabic wording meanwhile.` };
  return { tone: "brick" as const, text: "Nothing will be sent: no approved wording yet. Submit the wording to WhatsApp." };
}

function ReminderKindCard({
  kind,
  rules,
  templates,
  connected,
  canEdit,
  open,
  onToggle,
  onRule,
  onTemplate,
  onTemplates,
}: {
  kind: TemplateKind;
  rules: WhatsAppRule[];
  templates: WhatsAppTemplate[];
  connected: boolean;
  canEdit: boolean;
  open: boolean;
  onToggle: () => void;
  onRule: (r: WhatsAppRule) => void;
  onTemplate: (t: WhatsAppTemplate) => void;
  onTemplates: (t: WhatsAppTemplate[]) => void;
}) {
  const ready = readiness(rules, templates, connected);
  const anyOn = rules.some((r) => r.enabled);
  const summary = rules
    .filter((r) => r.enabled)
    .map((r) => (r.at_time ? `${RULE_TITLE[r.kind]} at ${r.at_time}` : RULE_TITLE[r.kind]))
    .join(" · ");

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-card">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-ink-50/60" aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-900">{KIND_TITLE[kind]}</span>
            <Badge tone={ready.tone} dot size="sm">
              {anyOn ? (ready.tone === "leaf" ? "Ready" : ready.tone === "honey" ? "Partly ready" : "Not ready") : "Off"}
            </Badge>
          </span>
          <span className="block text-xs text-ink-500">{open ? KIND_DESCRIPTION[kind] : summary || KIND_DESCRIPTION[kind]}</span>
        </span>
        <FaChevronDown className={cn("mt-1 size-3 shrink-0 text-ink-400 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="space-y-5 border-t border-ink-100 px-4 py-4">
          <p className={cn("rounded-xl px-3 py-2 text-xs font-medium ring-1 ring-inset", ready.tone === "leaf" && "bg-leaf-50 text-leaf-800 ring-leaf-200", ready.tone === "honey" && "bg-honey-50 text-honey-800 ring-honey-200", ready.tone === "brick" && "bg-brick-50 text-brick-800 ring-brick-200", ready.tone === "neutral" && "bg-ink-50 text-ink-600 ring-ink-200")}>
            {ready.text}
          </p>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">When</h4>
            {rules.map((r) => (
              <RuleRow key={r.kind} rule={r} canEdit={canEdit} onRule={onRule} />
            ))}
          </div>

          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Who receives it</h4>
            <p className="text-sm text-ink-700">{KIND_RECIPIENTS[kind]}</p>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Wording</h4>
            <TemplateEditor templates={templates} canEdit={canEdit} connected={connected} onTemplate={onTemplate} onTemplates={onTemplates} />
          </div>
        </div>
      )}
    </section>
  );
}

// ── A rule: switch + timing ───────────────────────────────────────────────

function RuleRow({ rule, canEdit, onRule }: { rule: WhatsAppRule; canEdit: boolean; onRule: (r: WhatsAppRule) => void }) {
  const [draft, setDraft] = useState<RuleInput>({});
  const [saving, setSaving] = useState(false);
  const dirty = Object.keys(draft).length > 0;
  const v = <K extends keyof RuleInput>(k: K, fallback: RuleInput[K]) => (draft[k] !== undefined ? draft[k] : fallback) as RuleInput[K];

  const apply = async (input: RuleInput, optimistic?: Partial<WhatsAppRule>) => {
    const before = rule;
    if (optimistic) onRule({ ...rule, ...optimistic });
    setSaving(true);
    try {
      const saved = await saveRule(rule.kind, input);
      onRule(saved);
      setDraft({});
      if (input.enabled !== undefined && Object.keys(input).length === 1) toast.success(input.enabled ? `${RULE_TITLE[rule.kind]}: on.` : `${RULE_TITLE[rule.kind]}: off.`);
      else toast.success("Saved.");
    } catch (err) {
      onRule(before);
      toast.error(errorText(err, "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  const uses = (f: string) => rule.fields.includes(f);
  const num = (k: "days_after_due" | "repeat_every_days" | "months_since_visit" | "max_per_run", min: number, max: number, width = "w-20") => (
    <input
      type="number"
      min={min}
      max={max}
      value={v(k, rule[k] ?? undefined) ?? ""}
      onChange={(e) => setDraft((d) => ({ ...d, [k]: Number(e.target.value) }))}
      className={cn(inputClass, "h-9 px-2 text-center", width)}
      disabled={!canEdit}
    />
  );
  const time = (
    <input
      type="time"
      value={v("at_time", rule.at_time ?? "") ?? ""}
      onChange={(e) => setDraft((d) => ({ ...d, at_time: e.target.value }))}
      className={cn(inputClass, "h-9 w-28 px-2")}
      disabled={!canEdit}
    />
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-ink-50/40 px-3 py-2.5">
      <Switch checked={rule.enabled} onChange={(next) => void apply({ enabled: next }, { enabled: next })} disabled={!canEdit || saving} label={RULE_TITLE[rule.kind]} size="sm" />
      <div className="flex flex-1 flex-wrap items-center gap-2 text-sm text-ink-700">
        {rule.kind === "booking_confirmation" && <span className="text-ink-500">Sent right away when an appointment is booked.</span>}
        {(rule.kind === "appointment_day_before" || rule.kind === "appointment_morning_of" || rule.kind === "staff_daily") && uses("at_time") && (
          <>
            <span>at</span>
            {time}
            <span className="text-xs text-ink-500">clinic time</span>
          </>
        )}
        {rule.kind === "unpaid_bill" && (
          <>
            <span>First reminder</span>
            {num("days_after_due", 0, 60)}
            <span>days after the due date, then every</span>
            {num("repeat_every_days", 1, 365)}
            <span>days, at</span>
            {time}
          </>
        )}
        {rule.kind === "recall" && (
          <>
            <span>When there has been no visit for</span>
            {num("months_since_visit", 1, 36)}
            <span>months, at</span>
            {time}
            <span>· again after</span>
            {num("repeat_every_days", 1, 365)}
            <span>days · at most</span>
            {num("max_per_run", 1, 500)}
            <span>per run</span>
          </>
        )}
      </div>
      {dirty && canEdit && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setDraft({})} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void apply(draft)} disabled={saving}>
            <FaCheck className="me-1" /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Wording in two languages, with Meta's verdict ─────────────────────────

function TemplateEditor({
  templates,
  canEdit,
  connected,
  onTemplate,
  onTemplates,
}: {
  templates: WhatsAppTemplate[];
  canEdit: boolean;
  connected: boolean;
  onTemplate: (t: WhatsAppTemplate) => void;
  onTemplates: (t: WhatsAppTemplate[]) => void;
}) {
  const [language, setLanguage] = useState<MessageLanguage>("en");
  const current = templates.find((t) => t.language === language);
  const items = (["en", "ar"] as const).map((lang) => {
    const t = templates.find((x) => x.language === lang);
    return { id: lang, label: lang === "en" ? "English" : "العربية", dot: t ? t.meta_status === "draft" || t.meta_status === "rejected" : false };
  });
  return (
    <div className="space-y-3">
      <Tabs label="Language" variant="pill" value={language} onChange={setLanguage} items={items} />
      {current ? (
        <OneTemplate key={String(current.id)} template={current} canEdit={canEdit} connected={connected} onTemplate={onTemplate} onTemplates={onTemplates} />
      ) : (
        <p className="text-sm text-ink-500">No wording in this language yet.</p>
      )}
    </div>
  );
}

function OneTemplate({
  template,
  canEdit,
  connected,
  onTemplate,
  onTemplates,
}: {
  template: WhatsAppTemplate;
  canEdit: boolean;
  connected: boolean;
  onTemplate: (t: WhatsAppTemplate) => void;
  onTemplates: (t: WhatsAppTemplate[]) => void;
}) {
  const clinic = useClinicIdentity();
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = body.trim() !== template.body.trim();
  const check = useMemo(() => validateBody(body, template.params), [body, template.params]);
  const isAr = template.language === "ar";

  const insert = (n: number) => {
    const el = area.current;
    const token = `{{${n}}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    if (check.error) return toast.error(check.error);
    setSaving(true);
    try {
      const saved = await saveTemplate(template.id, body.trim());
      onTemplate({ ...template, ...saved });
      toast.success(template.meta_status === "approved" ? "Saved as a new draft. The approved wording keeps sending until this one is approved." : "Wording saved.");
    } catch (err) {
      toast.error(errorText(err, "Could not save the wording."));
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      if (dirty) {
        if (check.error) return toast.error(check.error);
        const saved = await saveTemplate(template.id, body.trim());
        onTemplate({ ...template, ...saved });
      }
      const r = await submitTemplates([template.id]);
      onTemplates(r.templates);
      const mine = r.results.find((x) => String(x.id) === String(template.id));
      if (mine?.ok) toast.success("Sent to WhatsApp for approval.");
      else toast.error(mine?.message ?? "WhatsApp refused it.");
    } catch (err) {
      toast.error(errorText(err, "Could not submit to WhatsApp."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={META_STATUS_TONE[template.meta_status]} dot={template.meta_status === "pending"}>
          {META_STATUS_LABEL[template.meta_status]}
        </Badge>
        <span className="text-xs text-ink-500">{META_STATUS_MEANING[template.meta_status]}</span>
      </div>
      {template.meta_status === "rejected" && (
        <div className="rounded-xl border border-brick-200 bg-brick-50 px-3 py-2 text-xs text-brick-800">
          {template.meta_reason && (
            <p className="mb-1">
              WhatsApp said: <strong>{template.meta_reason}</strong>
            </p>
          )}
          <p>Common reasons: {REJECTION_REASONS.join("; ")}.</p>
        </div>
      )}
      <FormField label="The message" hint={`${body.length} / ${BODY_MAX}`}>
        <textarea
          ref={area}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          dir={isAr ? "rtl" : "ltr"}
          disabled={!canEdit}
          className={cn(inputClass, "min-h-32 h-auto py-2.5 leading-relaxed")}
        />
      </FormField>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="me-1 text-xs text-ink-500">Tap to insert:</span>
        {template.params.map((p, i) => (
          <button key={p} type="button" onClick={() => insert(i + 1)} disabled={!canEdit} className="press rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs text-ink-700 hover:bg-ink-50 disabled:opacity-50">
            <span className="font-mono">{`{{${i + 1}}}`}</span> {PLACEHOLDER_LABEL[p] ?? p}
          </button>
        ))}
      </div>
      {check.error && <p className="text-xs text-brick-700">{check.error}</p>}
      {!check.error && check.warning && <p className="text-xs text-honey-800">{check.warning}</p>}

      <div>
        <div className="mb-1 text-xs font-medium text-ink-600">Example</div>
        <div className="flex">
          <div dir={isAr ? "rtl" : "ltr"} className="max-w-md rounded-2xl rounded-ss-sm bg-[#dcf8c6] px-3.5 py-2 text-sm leading-relaxed text-ink-900 shadow-sm">
            {renderPreview(body, template.params, template.language, clinic?.name) || <span className="text-ink-400">Nothing yet</span>}
            <span className="ms-2 inline-block align-bottom text-[10px] text-ink-500">10:31 ✓✓</span>
          </div>
        </div>
        <p className="mt-1 text-xs text-ink-500">Dates and amounts are written by the system when sent.</p>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <Button size="sm" variant="outline" onClick={() => void save()} disabled={!dirty || saving || !!check.error}>
            {saving ? "Saving…" : "Save wording"}
          </Button>
          {body !== template.default_body && (
            <Button size="sm" variant="ghost" onClick={() => setBody(template.default_body)}>
              <FaUndo className="me-1" /> Suggested wording
            </Button>
          )}
          <Button size="sm" onClick={() => void submit()} disabled={submitting || !connected || !!check.error || (template.meta_status === "pending" && !dirty) || (template.meta_status === "approved" && !dirty)} title={connected ? undefined : "Connect the number first"}>
            <FaPaperPlane className="me-1" />
            {submitting ? "Submitting…" : "Submit to WhatsApp"}
          </Button>
        </div>
      )}
      <p className="text-xs text-ink-500">
        WhatsApp must approve each wording before it can be sent, usually within minutes, sometimes up to a day. Editing an approved wording
        sends it for approval again; until then the last approved wording keeps being used.
      </p>
    </div>
  );
}
