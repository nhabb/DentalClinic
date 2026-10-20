"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FaPlus } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { inputClass } from "@/components/ui/FormField";
import { mapSupplier, readError, type Supplier } from "./expense-types";

/*
 * Pick who the bill is from, or add them on the spot. Suppliers are
 * remembered so the next bill from the same place is one click, and so
 * "how much did we pay them" has an answer.
 */

interface SupplierPickerProps {
  suppliers: Supplier[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** A supplier was added; the page keeps the list. */
  onAdded: (supplier: Supplier) => void;
  canAdd: boolean;
}

export function SupplierPicker({
  suppliers,
  value,
  onChange,
  onAdded,
  canAdd,
}: SupplierPickerProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/expense-suppliers", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Could not add that supplier."));
        return;
      }
      const supplier = mapSupplier(await res.json());
      onAdded(supplier);
      onChange(supplier.id);
      setAdding(false);
      setName("");
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="Supplier name"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={saving || !name.trim()}
          className="shrink-0 rounded-xl bg-brand px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setAdding(false)}
          className="shrink-0 rounded-xl border border-gray-200 px-3 text-sm text-gray-600"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <select
        className={inputClass}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">No supplier</option>
        {suppliers
          .filter((s) => s.is_active || s.id === value)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
      {canAdd && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          title="Add a supplier"
          className="shrink-0 rounded-xl border border-gray-200 px-3 text-sm text-gray-600 hover:border-brand hover:text-brand"
        >
          <FaPlus />
        </button>
      )}
    </div>
  );
}
