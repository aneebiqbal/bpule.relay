'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { reportError } from '@/lib/errors'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportError(error, { source: 'relay-benchmark-page', digest: error.digest })
  }, [error])

  return (
    <section className="rounded border border-status-danger/30 bg-status-danger/8 px-5 py-10 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-status-danger/12">
        <AlertTriangle className="size-5 text-status-danger" />
      </div>
      <h1 className="mt-3 text-[18px] font-medium text-ink">Unable to load benchmark details</h1>
      <p className="mx-auto mt-2 max-w-xl text-[13px] text-graphite">
        Relay could not load the benchmark snapshot for this view. Try again to re-run the page request.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-5 inline-flex items-center gap-2 rounded border border-line bg-bone-raised px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
      >
        <RefreshCw className="size-3.5" />
        Try again
      </button>
    </section>
  )
}
