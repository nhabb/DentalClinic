"use client";

import { type ReactNode } from "react";
import { FaTimes } from "react-icons/fa";
import { cn } from "@/lib/utils";
import { useDialogBehavior } from "@/components/ui/useDialogBehavior";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
  /** One line of context under the title. */
  description?: string;
  /** Pinned action bar at the bottom; stays reachable while the body scrolls. */
  footer?: ReactNode;
}

/**
 * Right-anchored slide-over — a lighter-weight sibling of Modal for quick
 * peeks (a patient's headline info, a record preview) that shouldn't
 * interrupt the list behind it as fully as a centered dialog does. Shares
 * Modal's focus/Escape/scroll-lock behavior via useDialogBehavior.
 */
export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
  description,
  footer,
}: DrawerProps) {
  const panelRef = useDialogBehavior(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink-950/45 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden bg-card shadow-2xl outline-none animate-slide-left",
          maxWidth,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-ink-200/70 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold tracking-tight text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press -me-2 -mt-1 rounded-xl p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-800"
          >
            <FaTimes />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-ink-200/70 bg-ink-50/60 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
