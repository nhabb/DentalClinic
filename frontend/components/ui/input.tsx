import { cn } from "@/lib/utils"

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

/* The shared field look: a tinted resting state that lifts to white on
 * focus, so the active field is obvious in a long form. */
export const fieldClass = cn(
  "h-11 w-full rounded-xl border border-ink-200 bg-ink-50/70 px-3.5 text-sm text-ink-900",
  "transition-[background-color,border-color,box-shadow] duration-200",
  "placeholder:text-ink-400",
  "hover:border-ink-300",
  "focus:border-brand-400 focus:bg-card focus:outline-none focus:ring-4 focus:ring-brand-500/12",
  "disabled:cursor-not-allowed disabled:opacity-55",
  "aria-invalid:border-brick-400 aria-invalid:ring-4 aria-invalid:ring-brick-500/12",
)

export function Input({ className, ...props }: InputProps) {
  return <input className={cn(fieldClass, className)} {...props} />
}
