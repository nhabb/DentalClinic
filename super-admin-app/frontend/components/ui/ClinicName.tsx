/**
 * The clinic's name as a wordmark, with an optional line beneath it (branch,
 * "Admin Panel", "Operator console"). One component so the name looks the
 * same in every header of the clinic app and the platform console: display
 * serif, bold, up to two lines, never truncated to a single clipped word.
 *
 * Identical copy in client-app/frontend/components/ui/ClinicName.tsx.
 */
const SIZES = {
  sm: "text-[15px]",
  md: "text-lg",
  lg: "text-xl",
} as const;

export interface ClinicNameProps {
  /** Clinic name; null while loading renders an empty line of the same height. */
  name?: string | null;
  /** Second line: the branch, or the app area when there is no branch. */
  detail?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

export function ClinicName({ name, detail, size = "md", className = "" }: ClinicNameProps) {
  return (
    <span className={`flex min-w-0 flex-col leading-tight ${className}`.trim()}>
      <span
        className={`line-clamp-2 font-display font-bold text-ink-900 ${SIZES[size]}`}
        title={name ?? undefined}
      >
        {name ?? " "}
      </span>
      {detail && (
        <span className="truncate text-[11px] text-ink-400" title={detail}>
          {detail}
        </span>
      )}
    </span>
  );
}
