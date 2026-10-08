import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  children: ReactNode;
  /** Shows the required marker and nothing else — validation stays on the input. */
  required?: boolean;
  /** Quiet guidance shown under the control. */
  hint?: string;
  /** When set, replaces the hint and tints it as an error. */
  error?: string;
  className?: string;
}

export function FormField({ label, children, required, hint, error, className }: FormFieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <label className="mb-1.5 block text-[13px] font-semibold text-ink-700">
        {label}
        {required && (
          <span className="ms-1 text-clay-600" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {(error || hint) && (
        <p className={cn("mt-1.5 text-xs", error ? "font-medium text-brick-600" : "text-ink-500")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

/* The canonical field look, shared with <Input>. Pages import this when
 * they render a bare <input>/<select> instead of the component. */
export const inputClass =
  "h-11 w-full rounded-xl border border-ink-200 bg-ink-50/70 px-3.5 text-sm text-ink-900 " +
  "transition-[background-color,border-color,box-shadow] duration-200 placeholder:text-ink-400 " +
  "hover:border-ink-300 focus:border-brand-400 focus:bg-card focus:outline-none focus:ring-4 focus:ring-brand-500/12 " +
  "disabled:cursor-not-allowed disabled:opacity-55";
