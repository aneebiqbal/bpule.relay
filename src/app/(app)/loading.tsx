import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-5">
      {/* Hero skeleton */}
      <div className="reveal-up rounded-[1.75rem] border border-line/80 bg-bg-bone-raised p-6 sm:p-8">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Skeleton className="size-14 rounded-2xl sm:size-16" />
            <div className="space-y-2.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-48 sm:h-9 sm:w-56" />
              <Skeleton className="h-3.5 w-64" />
            </div>
          </div>
          <Skeleton className="h-12 w-28 rounded-2xl" />
        </div>
        <div className="mt-7 flex items-center gap-5 border-t border-line/60 pt-6">
          <Skeleton className="h-8 w-32" />
          <span className="h-5 w-px bg-line" />
          <Skeleton className="h-8 w-32" />
          <span className="hidden h-5 w-px bg-line sm:block" />
          <Skeleton className="hidden h-8 w-32 sm:block" />
        </div>
      </div>

      {/* Spotlight card skeleton */}
      <div className="reveal-up stagger-2 rounded-[1.75rem] border border-orange/15 bg-bg-bone-raised p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:justify-between">
          <div className="flex-1 space-y-5">
            <Skeleton className="h-5 w-32 rounded-full" />
            <Skeleton className="h-9 w-64 sm:text-4xl" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="size-[100px] rounded-full" />
            <Skeleton className="h-11 w-48 rounded-2xl" />
          </div>
        </div>
      </div>

      {/* Queue skeleton */}
      <div className="reveal-up stagger-4 space-y-4">
        <Skeleton className="h-3 w-28" />
        <div className="overflow-hidden rounded-[1.25rem] border border-line/80 bg-bg-bone-raised">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-line/60 px-5 py-3.5">
              <Skeleton className="size-[44px] rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="size-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
