import { forwardRef } from "react"
import { cn } from "@/lib/utils"

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

/* Every variant keeps the same geometry so swapping one for another never
 * shifts the layout — only colour and weight change. */
const variants = {
  /* Primary action. One per view, ideally. */
  default:
    "bg-primary text-primary-foreground shadow-sm hover:bg-brand-700 hover:shadow-md active:shadow-sm",
  /* Same weight as default but in the warm accent, for a second
   * equally-important action (e.g. "Add payment" beside "Save"). */
  accent:
    "bg-clay-600 text-white shadow-sm hover:bg-clay-700 hover:shadow-md active:shadow-sm",
  outline:
    "border border-ink-300 bg-card text-ink-800 shadow-xs hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700",
  /* Tinted, borderless — reads as interactive without competing with the
   * primary button. The workhorse for toolbars. */
  soft:
    "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-ink-200",
  ghost:
    "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
  destructive:
    "bg-destructive text-destructive-foreground shadow-sm hover:bg-brick-700 hover:shadow-md",
  link:
    "text-brand-700 underline-offset-4 hover:underline hover:text-brand-800",
}

const sizes = {
  default: "h-10 px-4 py-2 text-sm gap-2",
  sm: "h-8 px-3 text-xs gap-1.5",
  lg: "h-11 px-6 text-sm gap-2",
  xl: "h-12 px-7 text-base gap-2.5",
  icon: "h-10 w-10",
  "icon-sm": "h-8 w-8",
}

export function buttonVariants({
  variant = "default",
  size = "default",
}: { variant?: keyof typeof variants; size?: keyof typeof sizes } = {}) {
  return cn(
    "press inline-flex shrink-0 items-center justify-center rounded-xl font-semibold whitespace-nowrap",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
    "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
    "[&>svg]:shrink-0 [&>svg]:size-4",
    variants[variant],
    sizes[size],
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)

Button.displayName = "Button"
