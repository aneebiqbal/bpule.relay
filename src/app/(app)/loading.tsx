import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>

      <div className="grid grid-cols-1 gap-6 py-2 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-1 w-32" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <div className="overflow-hidden rounded-lg border border-line">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none border-b border-line" />
          ))}
        </div>
      </div>
    </div>
  )
}
