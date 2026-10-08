"use client";

import { type ReactNode } from "react";
import { FaTimes } from "react-icons/fa";
import { cn } from "@/lib/utils";
import { useDialogBehavior } from "@/components/ui/useDialogBehavior";

interface ModalProps {
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
 * Shared dialog. The panel never grows past the viewport: the title stays
 * pinned and the body scrolls, so long forms keep their footer buttons
 * reachable. While open it locks the page behind it and parks focus inside,
 * so Tab cannot wander off into the obscured page.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
  description,
  footer,
}: ModalProps) {
  const panelRef = useDialogBehavior(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/45 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
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
          "flex max-h-[92vh] w-full flex-col overflow-hidden bg-card shadow-2xl outline-none",
          "rounded-t-3xl sm:rounded-3xl animate-scale-in",
          maxWidth,
        )}
      >
        {/* Grab handle — the sheet is bottom-anchored on phones. */}
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink-300 sm:hidden" />

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
