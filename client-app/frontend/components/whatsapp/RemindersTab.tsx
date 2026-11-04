"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FaCheck, FaChevronDown, FaPaperPlane, FaPlus, FaSyncAlt, FaTrash, FaUndo } from "react-icons/fa";
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
  refreshTemplates,
  saveRule,
  saveTemplate,
  submitTemplates,
  updateCustomReminder,
  type CustomReminder,
  type CustomReminderInput,
  type MessageLanguage,
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
        {canSend && (
          <Button size="sm" onClick={onRun} disabled={running || !connected}>
            <FaPaperPlane className="me-2" />
            {running ? "Sending…" : "Send what is due now"}
          </Button>
        )}
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
const delayText = (days: number) => {
  const { amount, unit } = splitDelay(days);
  return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
};

function CustomRemindersSection({
  reminders,
  templates,
  connected,
  canEdit,
  onChange,
  onTemplate,
  onTemplates,
  onReloadTemplates,
}: {
  reminders: CustomReminder[];
  templates: WhatsAppTemplate[];
  connected: boolean;
  canEdit: boolean;
  onChange: (list: CustomReminder[]) => void;
  onTemplate: (t: WhatsAppTemplate) => void;
  onTemplates: (t: WhatsAppTemplate[]) => void;
  onReloadTemplates: () => void;
}) {
  const [editing, setEditing] = useState<CustomReminder | "new" | null>(null);
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
      <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Your own reminders</h3>
          <p className="text-xs text-ink-500">
            A message a set time after a procedure on the chart, in your words: one week after every root canal, six months after a
            cleaning. Each goes once per procedure, never twice.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <FaPlus className="me-2" /> Add a reminder
          </Button>
        )}
      </div>

      {reminders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-500">
          No reminders of your own yet.
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
                      {delayText(r.delay_days)} after {r.procedure ? `every ${r.procedure.toLowerCase()}` : "any procedure"}
                      {r.at_time ? `, at ${r.at_time}` : ""}
                      {r.skip_if_booked ? " · not if already booked" : ""}
                    </span>
                    <Badge tone={ready.tone} dot size="sm">
                      {r.enabled ? (ready.tone === "leaf" ? "Ready" : ready.tone === "honey" ? "Partly ready" : "Not ready") : "Off"}
                    </Badge>
                  </span>
                </button>
                {canEdit && (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
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
                    <p className="text-sm text-ink-700">{KIND_RECIPIENTS.custom}</p>
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
          onClose={() => setEditing(null)}
          onSaved={(saved, created) => {
            onChange(created ? [...reminders, saved] : reminders.map((x) => (String(x.id) === String(saved.id) ? saved : x)));
            if (created) {
              onReloadTemplates();
              setOpen(String(saved.id));
            }
            setEditing(null);
          }}
        />
      )}
    </section>
  );
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
  const initial = reminder ? splitDelay(reminder.delay_days) : { amount: 7, unit: "days" as Unit };
  const [name, setName] = useState(reminder?.name ?? "");
  const [procedure, setProcedure] = useState(reminder?.procedure ?? "");
  const [amount, setAmount] = useState(initial.amount);
  const [unit, setUnit] = useState<Unit>(initial.unit);
  const [atTime, setAtTime] = useState(reminder?.at_time ?? "10:00");
  const [skipIfBooked, setSkipIfBooked] = useState(reminder?.skip_if_booked ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const perUnit = UNITS.find(([u]) => u === unit)?.[1] ?? 1;
  const days = Math.max(1, Math.round(amount)) * perUnit;

  const save = async () => {
    setError("");
    if (!name.trim()) return setError("Give the reminder a name.");
    if (!Number.isFinite(amount) || amount < 1) return setError("The delay must be at least 1.");
    if (days > 730) return setError("The delay can be at most two years.");
    const input: CustomReminderInput = {
      name: name.trim(),
      procedure: procedure || null,
      delay_days: days,
      at_time: atTime || "10:00",
      skip_if_booked: skipIfBooked,
    };
    setSaving(true);
    try {
      const saved = reminder ? await updateCustomReminder(reminder.id, input) : await createCustomReminder({ ...input, enabled: true });
      toast.success(reminder ? "Reminder saved." : "Reminder added. Now check its wording and submit it to WhatsApp.");
      onSaved(saved, !reminder);
    } catch (err) {
      setError(errorText(err, "Could not save the reminder."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => !saving && onClose()}
      title={reminder ? "Edit the reminder" : "A reminder of your own"}
      description="It goes to the patient a set time after the procedure is marked done on their chart, once per procedure."
      maxWidth="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : reminder ? "Save" : "Add reminder"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField label="Name" required hint="For your own eyes, e.g. After root canal">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus />
        </FormField>
        <FormField label="After which procedure" hint="Matches what the chart records; leave it as any to follow every procedure">
          <select value={procedure} onChange={(e) => setProcedure(e.target.value)} className={inputClass}>
            <option value="">Any procedure</option>
            {PROCEDURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="How long after" required>
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={inputClass} />
          </FormField>
          <FormField label=" ">
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className={inputClass}>
              {UNITS.map(([u]) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="At (clinic time)">
            <input type="time" value={atTime} onChange={(e) => setAtTime(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <Switch checked={skipIfBooked} onChange={setSkipIfBooked} label="Skip patients who already have an appointment booked" size="sm" />
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
