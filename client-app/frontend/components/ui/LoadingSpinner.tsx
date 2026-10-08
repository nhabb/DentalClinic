import { cn } from "@/lib/utils";

/** Full-area loading state. `label` is announced to screen readers. */
export function LoadingSpinner({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex h-64 flex-col items-center justify-center gap-3", className)}
    >
      <span className="relative flex size-10 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-[3px] border-brand-100" />
        <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-brand-600" />
      </span>
      <span className="text-xs font-medium text-ink-500">{label}</span>
    </div>
  );
}
