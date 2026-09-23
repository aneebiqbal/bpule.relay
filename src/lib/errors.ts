/**
 * Minimal error-monitoring hook. Every failure in production should be visible
 * to whoever maintains Relay, not only discovered when a rep mentions it.
 *
 * Today this logs a structured error to the server console. Point it at a
 * real sink (Sentry, an internal webhook, or a log drain) by setting
 * `ERROR_WEBHOOK_URL`; the payload is already shaped for one.
 */
import { NextResponse } from "next/server"

export interface ErrorContext {
  [key: string]: unknown
}

/**
 * Extracts a human-readable message from any thrown value. Error instances
 * are the common case, but Supabase/Postgrest errors are plain objects with
 * a `.message` field, not Error instances — String(error) on those (or on
 * any other plain object) produces the useless literal "[object Object]",
 * which is what actually happened here before this fix (see the messages
 * idempotency race-condition investigation, TEAM-003).
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function reportError(error: unknown, context: ErrorContext = {}): void {
  const payload = {
    ts: new Date().toISOString(),
    message: describeError(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  }

  // Always log locally so a dev or an attached log drain sees it immediately.
  console.error("[relay:error]", payload)

  const webhook = process.env.ERROR_WEBHOOK_URL
  if (webhook) {
    fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {})
  }
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public safeMessage: string = "An unexpected error occurred.",
  ) {
    super(message)
  }
}

export function safeErrorResponse(
  error: unknown,
  fallbackStatus: number = 500,
  fallbackMessage: string = "An unexpected error occurred.",
  route: string = "unknown",
): NextResponse {
  const status = error instanceof AppError ? error.statusCode : fallbackStatus
  const safeMessage =
    error instanceof AppError ? error.safeMessage : fallbackMessage

  // In development or for 500s, include the actual error message for debugging
  const isDev = process.env.NODE_ENV === 'development'
  const finalMessage = isDev || status === 500
    ? `${fallbackMessage} (${describeError(error)})`
    : safeMessage

  reportError(error, { route, status })
  return NextResponse.json({ error: finalMessage }, { status })
}
