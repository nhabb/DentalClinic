"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { FormField, inputClass } from "@/components/ui/FormField";

/** Header the API reads the admin's re-entered password from (ConfirmedAdminGuard). */
export const CONFIRM_PASSWORD_HEADER = "X-Confirm-Password";

interface PasswordConfirmModalProps {
  open: boolean;
  title: string;
  /** What is about to happen, in one or two sentences. */
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  /** Error from the last attempt (wrong password, refused by the API). */
  error?: string;
  onConfirm: (password: string) => void;
  onClose: () => void;
}

/**
 * Step-up confirmation for deleting money records: the admin types their own
 * password again. The password is sent once, in a header, and never stored.
 */
export function PasswordConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Delete",
  busy = false,
  error,
  onConfirm,
  onClose,
}: PasswordConfirmModalProps) {
  const [password, setPassword] = useState("");
  useEffect(() => {
    if (!open) setPassword("");
  }, [open]);
  if (!open) return null;

  return (
    <Modal isOpen={open} onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password) onConfirm(password);
        }}
      >
        <p className="text-sm text-ink-600">{description}</p>
        <p className="rounded-lg border border-brick-200 bg-brick-50 px-3 py-2 text-xs text-brick-800">
          This cannot be undone. The deletion is recorded in the audit log under your name.
        </p>
        <FormField label="Your password *">
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="Re-enter your password to confirm"
          />
        </FormField>
        {error && (
          <p className="rounded-lg border border-brick-200 bg-brick-50 px-3 py-2 text-sm text-brick-700">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={busy || !password}>
            {busy ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
