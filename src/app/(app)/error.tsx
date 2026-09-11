"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { reportError } from "@/lib/errors"

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
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-lg font-medium text-ink">Something went wrong</h1>
      <p className="text-sm leading-relaxed text-slate">
        Relay hit a problem loading this screen. Nothing was lost; try again, and
        if it keeps happening the failure has already been logged for whoever
        maintains the tool.
      </p>
      <Button className="bg-gold text-paper hover:bg-gold/90" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  )
}
