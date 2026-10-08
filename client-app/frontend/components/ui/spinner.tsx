import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

type SpinnerProps = React.SVGAttributes<SVGSVGElement>

export function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <Loader2Icon
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}
