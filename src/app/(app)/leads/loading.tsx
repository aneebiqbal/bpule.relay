export default function LeadsLoading() {
  return (
    <div className="space-y-5">
      <div className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <div className="h-3 w-24 rounded bg-bone/60" />
        <div className="mt-3 h-8 w-72 rounded bg-bone/60" />
        <div className="mt-2 h-4 w-96 rounded bg-bone/60" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded border border-line bg-bone-raised">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="size-9 rounded-full bg-bone/60" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-bone/60" />
                <div className="h-3 w-24 rounded bg-bone/60" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
