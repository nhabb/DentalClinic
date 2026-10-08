"use client";

import { useEffect, useRef } from "react";

/**
 * Shared behavior for Modal and Drawer: Escape closes, the page behind is
 * locked from scrolling, and focus moves into the panel while open.
 */
export function useDialogBehavior(isOpen: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Freeze the page behind the overlay, then restore exactly what was
    // there before — pages may already be setting their own overflow.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog: the first real control if there is one,
    // otherwise the panel itself.
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panelRef.current)?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  return panelRef;
}
