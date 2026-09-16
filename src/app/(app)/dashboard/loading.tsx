export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      <div className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <div className="h-3 w-16 rounded bg-bone/60" />
        <div className="mt-3 h-8 w-64 rounded bg-bone/60" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded border border-line bg-bone/40" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="rounded border border-line bg-bone-raised p-5">
            <div className="h-4 w-32 rounded bg-bone/60" />
            <div className="mt-3 space-y-2">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-10 w-full rounded bg-bone/40" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
