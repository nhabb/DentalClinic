"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FaEye, FaEyeSlash, FaPlus } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/FormField";
import {
  formatAmount,
  mapCategory,
  mapSupplier,
  readError,
  type ExpenseCategory,
  type Supplier,
} from "./expense-types";

/*
 * The clinic's own lists behind the expense form: categories and suppliers.
 * Both can be added, renamed and hidden; nothing is deleted, so past
 * expenses keep the category and supplier they were filed under.
 */

interface ExpenseListsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  suppliers: Supplier[];
  /** Something changed; the page reloads both lists. */
  onChanged: () => void;
  canCreate: boolean;
  canEdit: boolean;
}

export function ExpenseListsModal({
  isOpen,
  onClose,
  categories,
  suppliers,
  onChanged,
  canCreate,
  canEdit,
}: ExpenseListsModalProps) {
  const [tab, setTab] = useState<"categories" | "suppliers">("categories");
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const base = tab === "categories" ? "/api/expense-categories" : "/api/expense-suppliers";

  const call = async (path: string, init: RequestInit, fail: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(path, init);
      if (!res.ok) {
        toast.error(await readError(res, fail));
        return false;
      }
      onChanged();
      return true;
    } catch {
      toast.error("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!newName.trim()) return;
    const ok = await call(
      base,
      { method: "POST", body: JSON.stringify({ name: newName.trim() }) },
      "Could not add it.",
    );
    if (ok) setNewName("");
  };

  const rename = async () => {
    if (!renaming || !renaming.name.trim()) return;
    const ok = await call(
      `${base}/${renaming.id}`,
      { method: "PATCH", body: JSON.stringify({ name: renaming.name.trim() }) },
      "Could not rename it.",
    );
    if (ok) setRenaming(null);
  };

  const toggle = (id: number, active: boolean) =>
    call(
      `${base}/${id}`,
      { method: "PATCH", body: JSON.stringify({ is_active: !active }) },
      "Could not change it.",
    );

  // Both lists share one row layout: a name, an optional line under it, and
  // rename / hide.
  const rows: { id: number; name: string; active: boolean; detail?: string }[] =
    tab === "categories"
      ? categories.map((c) => ({ id: c.id, name: c.name, active: c.is_active }))
      : suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          active: s.is_active,
          detail:
            s.expense_count > 0
              ? `${s.expense_count} bills · ${formatAmount(s.total_billed)} billed · ${formatAmount(s.total_paid)} paid`
              : "No bills yet",
        }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Categories and suppliers" maxWidth="max-w-xl">
      <div className="space-y-4">
        <Tabs
          label="Lists"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setRenaming(null);
            setNewName("");
          }}
          items={[
            { id: "categories", label: "Categories", count: categories.length },
            { id: "suppliers", label: "Suppliers", count: suppliers.length },
          ]}
        />

        {canCreate && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void add();
                }
              }}
              placeholder={tab === "categories" ? "New category, e.g. Lab bills" : "New supplier name"}
              className={inputClass}
            />
            <Button onClick={() => void add()} disabled={busy || !newName.trim()}>
              <FaPlus /> Add
            </Button>
          </div>
        )}

        <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
          {rows.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-gray-500">Nothing here yet.</li>
          )}
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
              {renaming?.id === r.id ? (
                <div className="flex flex-1 gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: r.id, name: e.target.value })}
                    className={inputClass}
                  />
                  <Button size="sm" onClick={() => void rename()} disabled={busy}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${r.active ? "text-gray-900" : "text-gray-400 line-through"}`}>
                      {r.name}
                    </p>
                    {r.detail && <p className="text-xs text-gray-500">{r.detail}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setRenaming({ id: r.id, name: r.name })}
                        className="rounded-lg px-2 py-1 text-xs text-brand hover:bg-gray-100"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggle(r.id, r.active)}
                        disabled={busy}
                        title={r.active ? "Hide from the form" : "Show in the form again"}
                        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                      >
                        {r.active ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">
          Hidden entries disappear from the form; expenses already filed under them keep them.
        </p>
      </div>
    </Modal>
  );
}

export async function fetchExpenseLists(): Promise<{
  categories: ExpenseCategory[];
  suppliers: Supplier[];
}> {
  const [cRes, sRes] = await Promise.all([
    apiFetch("/api/expense-categories?include_hidden=true"),
    apiFetch("/api/expense-suppliers?include_hidden=true"),
  ]);
  const categories = cRes.ok ? ((await cRes.json()) as unknown[]).map(mapCategory) : [];
  const suppliersBody = sRes.ok ? await sRes.json() : { data: [] };
  const suppliers = ((suppliersBody.data ?? []) as unknown[]).map(mapSupplier);
  return { categories, suppliers };
}
