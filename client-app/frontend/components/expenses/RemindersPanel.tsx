"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FaBell, FaEdit, FaPause, FaPlay, FaTrash } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/FormField";
import { SupplierPicker } from "./SupplierPicker";
import {
  formatAmount,
  readError,
  todayIso,
  type ExpenseCategory,
  type Supplier,
} from "./expense-types";

/*
 * Repeating expenses: rent on the 1st, salaries at month end, cleaning every
 * Monday. On each due day the server turns a reminder into a PENDING expense
 * that sits in "To pay" until someone records the payment, so it cannot be
 * forgotten the way a notification can.
 */

type Repeat = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
type EndMode = "never" | "after" | "on";

type Reminder = {
  id: number;
  title: string;
  supplier: { id: number; name: string } | null;
  supplier_id: number | null;
  category: string;
  amount: number | null;
  repeat: Repeat;
  weekday: number | null;
  day_of_month: number | null;
  month_of_year: number | null;
  start_date: string;
  end_mode: EndMode;
  end_after_count: number | null;
  end_on_date: string | null;
  is_active: boolean;
  next_due_on: string | null;
  notes: string | null;
};

const REPEATS: { value: Repeat; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "yearly", label: "Every year" },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const dayLabel = (d: number) => (d === 0 ? "the last day" : `day ${d}`);

/** "Every month on day 1", said the way a person would. */
export function describeRule(r: Pick<Reminder, "repeat" | "weekday" | "day_of_month" | "month_of_year">) {
  switch (r.repeat) {
    case "daily":
      return "Every day";
    case "weekly":
      return `Every ${WEEKDAYS[r.weekday ?? 0]}`;
    case "monthly":
      return `Every month on ${dayLabel(r.day_of_month ?? 1)}`;
    case "quarterly":
      return `Every 3 months on ${dayLabel(r.day_of_month ?? 1)}`;
    case "yearly":
      return `Every year on ${MONTHS[(r.month_of_year ?? 1) - 1]} ${r.day_of_month === 0 ? "(last day)" : r.day_of_month}`;
  }
}

const emptyForm = () => ({
  title: "",
  supplier_id: null as number | null,
  category: "rent",
  amountVaries: false,
  amount: "",
  repeat: "monthly" as Repeat,
  weekday: 1,
  day_of_month: 1,
  month_of_year: 1,
  start_date: todayIso(),
  end_mode: "never" as EndMode,
  end_after_count: "12",
  end_on_date: "",
  notes: "",
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapReminder = (r: any): Reminder => ({
  ...r,
  id: Number(r.id),
  supplier_id: r.supplier_id != null ? Number(r.supplier_id) : null,
  supplier: r.supplier ? { id: Number(r.supplier.id), name: r.supplier.name } : null,
  amount: r.amount != null ? Number(r.amount) : null,
  start_date: String(r.start_date).slice(0, 10),
  end_on_date: r.end_on_date ? String(r.end_on_date).slice(0, 10) : null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

interface RemindersPanelProps {
  categories: ExpenseCategory[];
  suppliers: Supplier[];
  onSupplierAdded: (s: Supplier) => void;
  /** Reminders changed; due ones may have become expenses. */
  onChanged: () => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function RemindersPanel({
  categories,
  suppliers,
  onSupplierAdded,
  onChanged,
  canCreate,
  canEdit,
  canDelete,
}: RemindersPanelProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Reminder | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/expense-reminders");
      setReminders(res.ok ? ((await res.json()) as unknown[]).map(mapReminder) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setForm(emptyForm());
    setEditing("new");
  };

  const openEdit = (r: Reminder) => {
    setForm({
      title: r.title,
      supplier_id: r.supplier_id,
      category: r.category,
      amountVaries: r.amount == null,
      amount: r.amount != null ? String(r.amount) : "",
      repeat: r.repeat,
      weekday: r.weekday ?? 1,
      day_of_month: r.day_of_month ?? 1,
      month_of_year: r.month_of_year ?? 1,
      start_date: r.start_date,
      end_mode: r.end_mode,
      end_after_count: String(r.end_after_count ?? 12),
      end_on_date: r.end_on_date ?? "",
      notes: r.notes ?? "",
    });
    setEditing(r);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Give it a title, e.g. Clinic rent.");
    const amount = parseFloat(form.amount);
    if (!form.amountVaries && (!Number.isFinite(amount) || amount <= 0))
      return toast.error("Enter the amount, or tick “The amount changes each time”.");
    if (form.end_mode === "on" && !form.end_on_date)
      return toast.error("Pick the day it ends.");

    const body = {
      title: form.title.trim(),
      supplier_id: form.supplier_id,
      category: form.category,
      amount: form.amountVaries ? null : amount,
      repeat: form.repeat,
      weekday: form.repeat === "weekly" ? form.weekday : null,
      day_of_month: ["monthly", "quarterly", "yearly"].includes(form.repeat) ? form.day_of_month : null,
      month_of_year: form.repeat === "yearly" ? form.month_of_year : null,
      start_date: form.start_date,
      end_mode: form.end_mode,
      end_after_count: form.end_mode === "after" ? Number(form.end_after_count) : null,
      end_on_date: form.end_mode === "on" ? form.end_on_date : null,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    try {
      const res = await apiFetch(
        editing === "new" ? "/api/expense-reminders" : `/api/expense-reminders/${(editing as Reminder).id}`,
        { method: editing === "new" ? "POST" : "PATCH", body: JSON.stringify(body) },
      );
      if (!res.ok) {
        toast.error(await readError(res, "Could not save the reminder."));
        return;
      }
      toast.success(editing === "new" ? "Repeating expense added." : "Repeating expense saved.");
      setEditing(null);
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (r: Reminder, active: boolean) => {
    const res = await apiFetch(`/api/expense-reminders/${r.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: active }),
    });
    if (!res.ok) return toast.error(await readError(res, "Could not change it."));
    await load();
    if (active) onChanged();
  };

  const remove = async (r: Reminder) => {
    if (!window.confirm(`Delete “${r.title}”? Expenses it already created stay.`)) return;
    const res = await apiFetch(`/api/expense-reminders/${r.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error(await readError(res, "Could not delete it."));
    await load();
  };

  const categoryName = (key: string) => categories.find((c) => c.key === key)?.name ?? key;
  const set = <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          On each due day a pending expense is created and waits in <strong>To pay</strong> until it is paid.
        </p>
        {canCreate && (
          <Button onClick={openNew}>
            <FaBell /> New repeating expense
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : reminders.length === 0 ? (
        <EmptyState
          icon={FaBell}
          title="No repeating expenses"
          description="Add rent, salaries or subscriptions once; the system adds them to To pay on their day."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-start">Expense</th>
                <th className="px-4 py-3 text-start">Repeats</th>
                <th className="px-4 py-3 text-end">Amount</th>
                <th className="px-4 py-3 text-start">Next</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reminders.map((r) => (
                <tr key={r.id} className={r.is_active ? "" : "opacity-60"}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{r.title}</p>
                    <p className="text-xs text-gray-500">
                      {categoryName(r.category)}
                      {r.supplier ? ` · ${r.supplier.name}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{describeRule(r)}</td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {r.amount == null ? <span className="text-gray-500">varies</span> : formatAmount(r.amount)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {!r.is_active ? "Paused" : r.next_due_on ?? "Ended"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <>
                          <button type="button" title="Edit" onClick={() => openEdit(r)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-brand">
                            <FaEdit />
                          </button>
                          <button
                            type="button"
                            title={r.is_active ? "Pause" : "Resume"}
                            onClick={() => void setActive(r, !r.is_active)}
                            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                          >
                            {r.is_active ? <FaPause /> : <FaPlay />}
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button type="button" title="Delete" onClick={() => void remove(r)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-red-500">
                          <FaTrash />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New repeating expense" : "Edit repeating expense"}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <FormField label="Title *">
            <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Clinic rent" className={inputClass} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category">
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>
                {categories
                  .filter((c) => c.is_active || c.key === form.category)
                  .map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Supplier">
              <SupplierPicker
                suppliers={suppliers}
                value={form.supplier_id}
                onChange={(id) => set("supplier_id", id)}
                onAdded={onSupplierAdded}
                canAdd={canCreate}
              />
            </FormField>
          </div>
          <FormField label="Amount">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              disabled={form.amountVaries}
              onChange={(e) => set("amount", e.target.value)}
              className={inputClass}
            />
            <label className="mt-1 flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={form.amountVaries} onChange={(e) => set("amountVaries", e.target.checked)} />
              The amount changes each time (it is filled in from the bill)
            </label>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Repeats *">
              <select value={form.repeat} onChange={(e) => set("repeat", e.target.value as Repeat)} className={inputClass}>
                {REPEATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </FormField>
            {form.repeat === "weekly" && (
              <FormField label="On *">
                <select value={form.weekday} onChange={(e) => set("weekday", Number(e.target.value))} className={inputClass}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </FormField>
            )}
            {["monthly", "quarterly", "yearly"].includes(form.repeat) && (
              <FormField label="Day *">
                <select value={form.day_of_month} onChange={(e) => set("day_of_month", Number(e.target.value))} className={inputClass}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                  <option value={0}>Last day of the month</option>
                </select>
              </FormField>
            )}
          </div>
          {form.repeat === "yearly" && (
            <FormField label="Month *">
              <select value={form.month_of_year} onChange={(e) => set("month_of_year", Number(e.target.value))} className={inputClass}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Starts on *">
              <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="Ends">
              <select value={form.end_mode} onChange={(e) => set("end_mode", e.target.value as EndMode)} className={inputClass}>
                <option value="never">Never</option>
                <option value="after">After a number of times</option>
                <option value="on">On a date</option>
              </select>
            </FormField>
          </div>
          {form.end_mode === "after" && (
            <FormField label="How many times *">
              <input type="number" min="1" value={form.end_after_count} onChange={(e) => set("end_after_count", e.target.value)} className={inputClass} />
            </FormField>
          )}
          {form.end_mode === "on" && (
            <FormField label="Last day *">
              <input type="date" min={form.start_date} value={form.end_on_date} onChange={(e) => set("end_on_date", e.target.value)} className={inputClass} />
            </FormField>
          )}
          <FormField label="Notes">
            <input type="text" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" className={inputClass} />
          </FormField>
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{describeRule(form)}</p>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
