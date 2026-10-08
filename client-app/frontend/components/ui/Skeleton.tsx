import { cn } from "@/lib/utils";

/** Shimmering placeholder. Prefer it over a spinner where the shape of the
 *  incoming content is already known — the page stops jumping on load. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4 w-full", className)} />;
}

/** Placeholder rows sized for the admin list tables. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("space-y-3 p-5", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 max-w-[32%] flex-1" />
          <Skeleton className="hidden h-3.5 max-w-[22%] flex-1 sm:block" />
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}
