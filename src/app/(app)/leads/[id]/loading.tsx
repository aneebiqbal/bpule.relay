export default function LeadDetailLoading() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line/80 bg-bone-raised overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="size-16 shrink-0 rounded-full bg-bone/60" />
              <div className="min-w-0 space-y-2">
                <div className="h-6 w-48 rounded bg-bone/60" />
                <div className="h-4 w-32 rounded bg-bone/60" />
              </div>
            </div>
            <div className="h-16 w-24 rounded bg-bone/60" />
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-line/60 bg-bone-raised p-5">
        <div className="h-4 w-full rounded bg-bone/60" />
        <div className="mt-2 h-4 w-3/4 rounded bg-bone/60" />
        <div className="mt-4 h-32 w-full rounded bg-bone/60" />
      </div>
    </div>
  )
}
