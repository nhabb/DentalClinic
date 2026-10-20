"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FaFileAlt, FaPaperclip, FaTrash } from "react-icons/fa";
import { apiFetch } from "@/lib/api/client";
import { readError, type ExpenseAttachment } from "./expense-types";

/*
 * The files kept with one expense: the supplier's PDF bill from email, or a
 * photo of a paper receipt. PDF, JPEG, PNG or WebP, uploaded from the laptop.
 */

interface ExpenseAttachmentsProps {
  expenseId: number;
  canEdit: boolean;
  /** The number of files changed; the list behind may show a count. */
  onChanged?: (count: number) => void;
}

export const ACCEPTED_FILES = "application/pdf,image/jpeg,image/png,image/webp";

/** Upload one file to an expense. Shared with the add form, which uploads after saving. */
export async function uploadExpenseFile(expenseId: number, file: File) {
  const body = new FormData();
  body.append("file", file);
  const res = await apiFetch(`/api/expenses/${expenseId}/attachments`, {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(await readError(res, `Could not upload ${file.name}.`));
  return res.json();
}

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function ExpenseAttachments({
  expenseId,
  canEdit,
  onChanged,
}: ExpenseAttachmentsProps) {
  const [files, setFiles] = useState<ExpenseAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/expenses/${expenseId}`);
      if (!res.ok) return;
      const body = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (body.attachments ?? []).map((a: any) => ({
        ...a,
        id: Number(a.id),
        size_bytes: Number(a.size_bytes),
      }));
      setFiles(rows);
      onChanged?.(rows.length);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) await uploadExpenseFile(expenseId, file);
      toast.success(list.length > 1 ? "Files attached." : "File attached.");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (file: ExpenseAttachment) => {
    if (!window.confirm(`Remove ${file.file_name}?`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/expenses/${expenseId}/attachments/${file.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(await readError(res, "Could not remove that file."));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Files</span>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              className="hidden"
              onChange={(e) => void upload(e.target.files)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline disabled:opacity-50"
            >
              <FaPaperclip /> {busy ? "Working…" : "Attach a file"}
            </button>
          </>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-gray-500">
          No file yet. Attach the supplier&apos;s PDF, or write the EX number on the paper bill and file it.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-gray-800 hover:text-brand"
              >
                <FaFileAlt className="shrink-0 text-gray-400" />
                <span className="truncate">{f.file_name}</span>
                <span className="shrink-0 text-xs text-gray-400">{sizeLabel(f.size_bytes)}</span>
              </a>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void remove(f)}
                  disabled={busy}
                  title="Remove"
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500 disabled:opacity-40"
                >
                  <FaTrash className="text-xs" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
