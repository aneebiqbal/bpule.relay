export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <div className="h-3 w-36 rounded bg-bone/20" />
        <div className="mt-3 h-8 w-80 max-w-full rounded bg-bone/20" />
        <div className="mt-2 h-3.5 w-[30rem] max-w-full rounded bg-bone/20" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded border border-line bg-bone-raised px-4 py-3">
            <div className="h-2.5 w-24 rounded bg-bone" />
            <div className="mt-2 h-6 w-20 rounded bg-bone" />
          </div>
        ))}
      </div>

      <div className="rounded border border-line bg-bone-raised px-4 py-4 sm:px-5">
        <div className="h-4 w-40 rounded bg-bone" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-14 rounded border border-line/70 bg-bone" />
          ))}
        </div>
      </div>
    </div>
  )
}
