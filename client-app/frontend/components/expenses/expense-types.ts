/*
 * One definition of an expense and its neighbours on the client.
 *
 * An expense is a bill the clinic received. The database numbers it (EX26-00012);
 * the number printed on the supplier's own paper is `supplierBillNumber`. Write
 * the EX number on the paper and file it: that is how the paper is found again.
 */

export type ExpenseStatus = "paid" | "pending" | "partial";

export type Expense = {
  id: number;
  /** EX26-00012, assigned by the database. */
  number: string;
  description: string;
  /** Key of one of the clinic's categories. */
  category: string;
  amount: number;
  amountPaid: number;
  remaining: number;
  status: ExpenseStatus;
  /** Bill date: the date on the supplier's bill (YYYY-MM-DD). */
  date: string;
  notes: string | null;
  supplier: { id: number; name: string } | null;
  supplierBillNumber: string | null;
  /** VAT included in the amount, as shown on the bill. Informational. */
  vatIncluded: number | null;
  attachmentsCount: number;
  /** Set when a repeating expense created it. */
  reminder: { id: number; title: string } | null;
};

export type ExpensePayment = {
  id: number;
  amount: number;
  method: string;
  notes: string | null;
  date: string;
};

export type ExpenseCategory = {
  id: number;
  key: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export type Supplier = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  expense_count: number;
  total_billed: number;
  total_paid: number;
};

export type ExpenseAttachment = {
  id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  created_at: string;
};

export const todayIso = () => new Date().toISOString().split("T")[0];

const dateOnly = (value: unknown) =>
  value ? String(value).split("T")[0] : todayIso();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapExpense(e: any): Expense {
  const amount = Number(e.amount) || 0;
  const amountPaid = Number(e.amount_paid) || 0;
  const remaining =
    e.remaining_amount != null
      ? Number(e.remaining_amount) || 0
      : Math.max(0, amount - amountPaid);
  const rawStatus = String(e.status ?? "").toLowerCase();
  const status: ExpenseStatus =
    rawStatus === "paid" || rawStatus === "partial" || rawStatus === "pending"
      ? rawStatus
      : amountPaid <= 0
        ? "pending"
        : remaining <= 0
          ? "paid"
          : "partial";
  return {
    id: Number(e.id),
    number: e.expense_number ?? `#${e.id}`,
    description: e.title ?? "",
    category: String(e.category ?? "other").toLowerCase(),
    amount,
    amountPaid,
    remaining,
    status,
    date: dateOnly(e.expense_date),
    notes: e.description ?? null,
    supplier: e.supplier ? { id: Number(e.supplier.id), name: e.supplier.name } : null,
    supplierBillNumber: e.supplier_bill_number ?? null,
    vatIncluded: e.vat_included != null ? Number(e.vat_included) : null,
    attachmentsCount: Number(e._count?.attachments ?? e.attachments?.length ?? 0),
    reminder: e.reminder ? { id: Number(e.reminder.id), title: e.reminder.title } : null,
  };
}

export function mapPayment(p: any): ExpensePayment {
  return {
    id: Number(p.id),
    amount: Number(p.amount) || 0,
    method: String(p.payment_method ?? "cash"),
    notes: p.notes ?? null,
    date: dateOnly(p.payment_date ?? p.created_at),
  };
}

export function mapSupplier(s: any): Supplier {
  return {
    id: Number(s.id),
    name: s.name,
    phone: s.phone ?? null,
    email: s.email ?? null,
    notes: s.notes ?? null,
    is_active: s.is_active !== false,
    expense_count: Number(s.expense_count ?? 0),
    total_billed: Number(s.total_billed ?? 0),
    total_paid: Number(s.total_paid ?? 0),
  };
}

export function mapCategory(c: any): ExpenseCategory {
  return {
    id: Number(c.id),
    key: c.key,
    name: c.name,
    is_active: c.is_active !== false,
    sort_order: Number(c.sort_order ?? 0),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    const msg = body?.message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string" && msg.trim()) return msg;
  } catch {
    /* ignore */
  }
  return fallback;
}

export const formatAmount = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
