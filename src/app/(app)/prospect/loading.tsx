export default function ProspectLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <div className="h-3 w-24 rounded bg-bone/60" />
        <div className="mt-3 h-8 w-72 rounded bg-bone/60" />
        <div className="mt-2 h-4 w-96 rounded bg-bone/60" />
      </div>
      <div className="srf-proof px-4 py-4 sm:px-5">
        <div className="h-4 w-40 rounded bg-bone/60" />
        <div className="mt-3 h-48 w-full rounded bg-bone/60" />
        <div className="mt-3 flex justify-end">
          <div className="h-9 w-24 rounded bg-bone/60" />
        </div>
      </div>
      <div className="flex min-h-[12rem] flex-col items-center justify-center rounded border border-dashed border-line px-6 text-center">
        <div className="size-8 rounded bg-bone/60" />
        <div className="mt-3 h-4 w-32 rounded bg-bone/60" />
      </div>
    </div>
  )
}
