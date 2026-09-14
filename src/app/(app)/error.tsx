"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { reportError } from "@/lib/errors"
import { AlertTriangle, RefreshCw } from "lucide-react"

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportError(error, { source: "route-error-boundary", digest: error.digest })
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-status-danger/8">
        <AlertTriangle className="size-6 text-status-danger" />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-heading text-xl text-ink">Something went wrong</h1>
        <p className="text-sm leading-relaxed text-slate">
          Relay hit a problem loading this screen. Nothing was lost — try again, and
          if it keeps happening the failure has already been logged.
        </p>
      </div>
      <Button onClick={() => reset()} className="gap-2">
        <RefreshCw className="size-3.5" />
        Try again
      </Button>
    </div>
  )
}
