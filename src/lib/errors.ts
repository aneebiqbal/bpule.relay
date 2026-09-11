/**
 * Minimal error-monitoring hook. Every failure in production should be visible
 * to whoever maintains Relay, not only discovered when a rep mentions it.
 *
 * Today this logs a structured error to the server console. Point it at a
 * real sink (Sentry, an internal webhook, or a log drain) by setting
 * `ERROR_WEBHOOK_URL`; the payload is already shaped for one.
 */
export interface ErrorContext {
  [key: string]: unknown
}

export function reportError(error: unknown, context: ErrorContext = {}): void {
  const payload = {
    ts: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  }

  // Always log locally so a dev or an attached log drain sees it immediately.
  console.error("[relay:error]", payload)

  const webhook = process.env.ERROR_WEBHOOK_URL
  if (webhook) {
    // Fire and forget; do not block or fail the request on a logging outage.
    fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {})
  }
}
