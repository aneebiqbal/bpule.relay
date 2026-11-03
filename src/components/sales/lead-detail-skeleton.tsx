/**
 * The one Lead 360 loading surface.
 *
 * It is used both as the route's Suspense fallback and as the record page's
 * post-hydration skeleton. Keeping them byte-identical means the markup React
 * hydrates is the markup the server emitted, whether the boundary had resolved
 * on the server or the client suspends on first paint.
 */
export function LeadDetailSkeleton() {
  return (
    <div className="space-y-4" data-testid="lead-detail-loading">
      <section className="overflow-hidden rounded-lg border border-line bg-bone-raised">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="size-16 shrink-0 rounded-full bg-bone/60" />
            <div className="min-w-0 space-y-2">
              <div className="h-6 w-48 rounded bg-bone/60" />
              <div className="h-4 w-32 rounded bg-bone/60" />
            </div>
          </div>
          <div className="h-16 w-24 rounded bg-bone/60" />
        </div>
      </section>
      <div className="space-y-4 rounded-lg border border-line bg-bone-raised p-5">
        <div className="h-4 w-40 rounded bg-bone/60" />
        <div className="mt-2 h-3 w-24 rounded bg-bone/60" />
        <div className="mt-4 h-24 w-full rounded bg-bone/60" />
      </div>
    </div>
  )
}
