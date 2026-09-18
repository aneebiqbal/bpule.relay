import { cn } from "cn"

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("shimmer rounded-md bg-bone-raised", className)}
      aria-hidden="true"
    />
  )
}

export function SkeletonText({ className }: SkeletonProps) {
  return <Skeleton className={cn("h-3.5", className)} />
}

export function SkeletonCircle({ className }: SkeletonProps) {
  return <Skeleton className={cn("rounded-full", className)} />
}

export function SkeletonButton({ className }: SkeletonProps) {
  return <Skeleton className={cn("h-8 rounded-md", className)} />
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn("rounded-lg border border-line bg-bone-raised p-4", className)}>
      <div className="space-y-2.5">
        <SkeletonText className="w-2/3" />
        <SkeletonText className="w-full" />
        <SkeletonText className="w-4/5" />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5, className }: SkeletonProps & { rows?: number }) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-3 border-b border-line pb-2">
        <SkeletonText className="h-3 w-24" />
        <SkeletonText className="h-3 w-32" />
        <SkeletonText className="h-3 w-20" />
        <SkeletonText className="h-3 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 py-1.5">
          <SkeletonText className="h-3.5 w-24" />
          <SkeletonText className="h-3.5 w-32" />
          <SkeletonText className="h-3.5 w-20" />
          <SkeletonText className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}
