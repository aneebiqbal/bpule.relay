import { V3Skeleton } from '@/components/v3/primitives'

/** Shape-matched Rep / Admin Home skeleton — no full-page spinner. */
export default function DashboardLoading() {
  return (
    <div className="space-y-8 pb-10" role="status" aria-busy="true" aria-label="Loading home">
      <header className="space-y-2">
        <div className="h-7 w-56 max-w-full rounded bg-bone" />
        <div className="h-3.5 w-32 max-w-full rounded bg-bone" />
        <div className="h-3 w-64 max-w-full rounded bg-bone" />
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <V3Skeleton key={i} variant="metric" />
        ))}
      </div>

      <section className="space-y-3">
        <div className="h-4 w-28 rounded bg-bone" />
        <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-bone-raised">
          {[0, 1, 2, 3, 4].map((i) => (
            <V3Skeleton key={i} variant="row" />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="h-4 w-24 rounded bg-bone" />
        <div className="rounded-lg border border-line bg-bone-raised p-4">
          <div className="h-3.5 w-1/3 rounded bg-bone" />
          <div className="mt-2 h-3 w-2/3 rounded bg-bone" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="h-4 w-32 rounded bg-bone" />
        <div className="h-20 rounded-lg border border-line bg-bone-raised" />
      </section>
    </div>
  )
}
