import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-5">
      {/* Console header skeleton */}
      <div className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-8 w-72 max-w-full" />
        <Skeleton className="mt-3 h-3.5 w-64 max-w-full" />
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded border border-orange/20 bg-orange/5 px-3 py-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-2 h-5 w-10" />
            </div>
          ))}
        </div>
      </div>

      {/* Body skeleton */}
      <div className="reveal-up stagger-2 space-y-2">
        <Skeleton className="h-3 w-28" />
        <div className="overflow-hidden rounded border border-line bg-bone-raised">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line/60 px-4 py-3.5 last:border-b-0">
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-44 max-w-full" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
