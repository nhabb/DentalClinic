"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FaEnvelope, FaInbox, FaQuestionCircle, FaRedo, FaSyncAlt, FaUserMd, FaWhatsapp } from "react-icons/fa";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { ShowMore } from "@/components/ui/ShowMore";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebounced, usePagedList } from "@/lib/api/paged";
import { cn, formatDateBeirut } from "@/lib/utils";
import { errorText } from "@/lib/api/request";
import { retryMessage, type MessageStatus, type WhatsAppMessage } from "@/lib/api/whatsapp";
import {
  KIND_SHORT,
  MESSAGE_STATUS_LABEL,
  MESSAGE_STATUS_MEANING,
  MESSAGE_STATUS_TONE,
  messageReason,
} from "./whatsapp-words";

/*
 * Every message and its fate. Filters by status (with counts), kind and
 * window; search by patient name or number. The list reloads every minute
 * while visible, since delivery receipts arrive after the send.
 */

const STATUSES: MessageStatus[] = ["queued", "sent", "delivered", "read", "failed", "skipped"];
const KINDS = [
  ["", "All"],
  ["appointment_day_before", "Day-before reminders"],
  ["appointment_morning_of", "Morning reminders"],
  ["booking_confirmation", "Confirmations"],
  ["unpaid_bill", "Bill reminders"],
  ["recall", "Check-up recalls"],
  ["staff_daily", "Doctors' days"],
  ["custom", "Your own reminders"],
] as const;
type Window = "today" | "week" | "month" | "all";

const dayIso = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
function windowRange(w: Window): { from?: string; to?: string } {
  const now = new Date();
  if (w === "today") return { from: dayIso(now), to: dayIso(now) };
  if (w === "week") return { from: dayIso(new Date(now.getTime() - 6 * 86_400_000)), to: dayIso(now) };
  if (w === "month") return { from: dayIso(new Date(now.getFullYear(), now.getMonth(), 1)), to: dayIso(now) };
  return {};
}

const relative = (iso: string | null) => {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return formatDateBeirut(iso);
};

type Counts = Partial<Record<MessageStatus | "all", number>>;

interface Props {
  enabled: boolean;
  connected: boolean;
  anyRuleOn: boolean;
  canSend: boolean;
  status: string;
  onStatus: (s: string) => void;
  /** Changes after a run so the list reloads. */
  runKey: number;
  onConnect: () => void;
  onReminders: () => void;
  onRun: () => void;
}

export function MessagesTable({ enabled, connected, anyRuleOn, canSend, status, onStatus, runKey, onConnect, onReminders, onRun }: Props) {
  const [kind, setKind] = useState("");
  const [window_, setWindow] = useState<Window>("week");
  const [q, setQ] = useState("");
  const search = useDebounced(q);
  const range = useMemo(() => windowRange(window_), [window_]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const list = usePagedList<WhatsAppMessage, Counts>({
    path: "/api/whatsapp/messages",
    params: { status, kind, search, from: range.from ?? "", to: range.to ?? "" },
    map: (row) => row as WhatsAppMessage,
    withCounts: true,
    enabled,
  });
  const { reload } = list;

  useEffect(() => {
    if (!enabled) return;
    setUpdatedAt(new Date());
  }, [enabled, list.rows]);

  useEffect(() => {
    if (!enabled || runKey === 0) return;
    void reload();
  }, [enabled, runKey, reload]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [enabled, reload]);

  const retry = async (m: WhatsAppMessage) => {
    try {
      const updated = await retryMessage(m.id);
      list.setRows((rows) => rows.map((r) => (String(r.id) === String(m.id) ? { ...r, ...updated } : r)));
      if (updated.status === "sent") toast.success("Sent again.");
      else if (updated.status === "skipped") toast.error(messageReason(updated) ?? "Still skipped.");
      else toast.error(messageReason(updated) ?? "It failed again.");
    } catch (err) {
      toast.error(errorText(err, "Could not retry."));
    }
  };

  const counts = list.counts ?? {};
  const hasFilters = !!status || !!kind || window_ !== "week" || !!q;

  return (
    <div className="space-y-3">
      <ListToolbar
        search={{ value: q, onChange: setQ, placeholder: "Search by patient name or number" }}
        shown={list.rows.length}
        total={list.total}
        unitLabel="messages"
        groups={[
          {
            key: "status",
            variant: "segmented",
            value: status,
            onChange: onStatus,
            options: [{ value: "", label: "All", count: counts.all }, ...STATUSES.map((s) => ({ value: s, label: MESSAGE_STATUS_LABEL[s], count: counts[s] }))],
          },
          { key: "kind", variant: "chips", value: kind, onChange: setKind, options: KINDS.map(([value, label]) => ({ value, label })) },
          {
            key: "window",
            variant: "segmented",
            value: window_,
            onChange: (v) => setWindow(v as Window),
            options: [
              { value: "today", label: "Today" },
              { value: "week", label: "Last 7 days" },
              { value: "month", label: "This month" },
              { value: "all", label: "All time" },
            ],
          },
        ]}
        hasActiveFilters={hasFilters}
        onClear={() => {
          onStatus("");
          setKind("");
          setWindow("week");
          setQ("");
        }}
        trailing={
          <span className="flex items-center gap-2 text-xs text-ink-500">
            {updatedAt && <span>Updated {relative(updatedAt.toISOString())}</span>}
            <button type="button" onClick={() => void reload()} className="press rounded-lg border border-ink-200 px-2 py-1 hover:bg-ink-50" aria-label="Refresh">
              <FaSyncAlt className={cn(list.loading && "animate-spin")} />
            </button>
          </span>
        }
      />

      {list.rows.length === 0 && !list.loading ? (
        hasFilters ? (
          <EmptyState icon={FaInbox} title="No messages match these filters" action={<Button variant="outline" onClick={() => { onStatus(""); setKind(""); setWindow("all"); setQ(""); }}>Clear filters</Button>} />
        ) : !connected ? (
          <EmptyState icon={FaWhatsapp} title="Nothing has been sent yet" description="Connect the clinic's number to start." action={<Button onClick={onConnect}>Connect the number</Button>} />
        ) : !anyRuleOn ? (
          <EmptyState icon={FaWhatsapp} title="Nothing has been sent yet" description="Switch on a reminder and it will appear here." action={<Button onClick={onReminders}>Open reminders</Button>} />
        ) : (
          <EmptyState icon={FaInbox} title="Nothing in this window yet" description="Reminders go out at their set times." action={canSend ? <Button onClick={onRun}>Send what is due now</Button> : undefined} />
        )
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-card">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/80 text-start text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 text-start">When</th>
                <th className="px-4 py-2.5 text-start">To</th>
                <th className="px-4 py-2.5 text-start">Message</th>
                <th className="hidden px-4 py-2.5 text-start md:table-cell">Language</th>
                <th className="px-4 py-2.5 text-start">
                  <span className="inline-flex items-center gap-1">
                    Status
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="text-ink-400 hover:text-ink-700" aria-label="What do these mean?">
                          <FaQuestionCircle />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 space-y-2 text-xs normal-case tracking-normal">
                        {STATUSES.map((s) => (
                          <div key={s} className="flex gap-2">
                            <Badge tone={MESSAGE_STATUS_TONE[s]} size="sm">
                              {MESSAGE_STATUS_LABEL[s]}
                            </Badge>
                            <span className="text-ink-600">{MESSAGE_STATUS_MEANING[s]}</span>
                          </div>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </span>
                </th>
                <th className="px-4 py-2.5 text-end">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.rows.map((m) => {
                const reason = messageReason(m);
                const when = m.sent_at ?? m.scheduled_for ?? m.created_at;
                const latest = m.read_at ?? m.delivered_at ?? m.sent_at ?? m.failed_at ?? null;
                return (
                  <tr key={String(m.id)} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-700">{formatDateBeirut(when)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 font-medium text-ink-900">
                        {m.recipient_kind === "staff" && <FaUserMd className="text-ink-400" aria-label="Staff" />}
                        {m.patient_id ? (
                          <Link href={`/admin/patients?patient=${m.patient_id}`} className="hover:underline">
                            {m.to_name ?? "Patient"}
                          </Link>
                        ) : (
                          m.to_name ?? "—"
                        )}
                      </div>
                      <div className="font-mono text-xs text-ink-500" dir="ltr">
                        {m.channel === "email" ? (
                          <span className="inline-flex items-center gap-1">
                            <FaEnvelope className="text-ink-400" aria-hidden /> {m.to_email ?? "no email on file"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <FaWhatsapp className="text-ink-400" aria-hidden /> {m.to_phone ? `+${m.to_phone}` : "no valid number"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-ink-800">
                      {m.kind === "custom" && m.custom_reminder_name ? m.custom_reminder_name : (KIND_SHORT[m.kind] ?? m.kind)}
                      {m.appointment_date && (
                        <Link href={`/admin/appointments?date=${m.appointment_date}`} className="block text-xs text-brand-700 hover:underline">
                          Appointment on {formatDateBeirut(m.appointment_date)}
                        </Link>
                      )}
                      {m.invoice_number && m.patient_id && (
                        <Link href={`/admin/billing/patient/${m.patient_id}?bill=${m.invoice_id}`} className="block text-xs text-brand-700 hover:underline">
                          Bill {m.invoice_number}
                        </Link>
                      )}
                    </td>
                    <td className="hidden px-4 py-2.5 md:table-cell">
                      {m.language && (
                        <Badge tone="neutral" size="sm">
                          {m.language.toUpperCase()}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={MESSAGE_STATUS_TONE[m.status]} dot size="sm">
                        {MESSAGE_STATUS_LABEL[m.status]}
                      </Badge>
                      {latest && m.status !== "failed" && m.status !== "skipped" && <div className="mt-0.5 text-xs text-ink-500">{relative(latest)}</div>}
                      {reason && <div className="mt-0.5 max-w-xs text-xs text-ink-600">{reason}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      {canSend && m.status === "failed" && (
                        <Button size="sm" variant="outline" onClick={() => void retry(m)}>
                          <FaRedo className="me-1" /> Retry
                        </Button>
                      )}
                      {canSend && m.status === "skipped" && m.skip_reason !== "opted_out" && m.skip_reason !== "too_late" && m.skip_reason !== "bad_phone" && (
                        <Button size="sm" variant="outline" onClick={() => void retry(m)}>
                          <FaRedo className="me-1" /> Retry
                        </Button>
                      )}
                      {m.status === "skipped" && m.skip_reason === "bad_phone" && m.patient_id && (
                        <Link href={`/admin/patients?patient=${m.patient_id}`} className="text-xs font-medium text-brand-700 hover:underline">
                          Fix the number
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ShowMore shown={list.rows.length} total={list.total} loading={list.loadingMore} onClick={list.loadMore} />
    </div>
  );
}
