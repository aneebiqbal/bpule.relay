/**
 * Narrow uncaught-exception policy for the production server.
 *
 * Node turns an EventEmitter `error` event with no listener into an
 * `uncaughtException`. The bundled Neon/pg driver can do exactly that when its
 * WebSocket transport fails: pg attaches its idle-client listener only after
 * `connect()` resolves, so a transport failure before that point is emitted
 * with nobody listening.
 *
 * That is an expected operational failure, not a bug. The query still rejects
 * and the caller still sees the error — the server just has to keep serving
 * static and non-database pages. Everything else is a real programmer error and
 * must still terminate the process.
 *
 * This is deliberately NOT a blanket catch: only transport-shaped failures
 * degrade, and everything unknown exits with the same status Node would have.
 */

/** Network / driver / pool failures that degrade gracefully. */
const TRANSPORT_PATTERNS: RegExp[] = [
  /unhandled error\.?/i, // EventEmitter wrapper around an unlistened 'error'
  /websocket/i,
  /error connecting to database/i,
  /error getting auth token/i,
  /connection terminated/i,
  /server closed the connection/i,
  /timeout exceeded when trying to connect/i,
  /too many connections/i,
  /econnrefused|enotfound|etimedout|econnreset|epipe|ehostunreach|enetunreach|eai_again/i,
  /connection error/i,
]

/** Only failures that carry a database-driver signature degrade. */
export function isDatabaseTransportFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false

  const error = err as { message?: unknown; context?: unknown; stack?: unknown }
  const message = typeof error.message === 'string' ? error.message : String(error)
  const stack = typeof error.stack === 'string' ? error.stack : ''
  const context = error.context as { message?: unknown } | undefined
  const contextMessage = typeof context?.message === 'string' ? context.message : ''

  // Node's EventEmitter produces exactly this message when an `error` event is
  // emitted with no listener. Nothing in application code generates it, so it
  // is self-identifying.
  if (/^Unhandled error\./.test(message)) return true

  // Any other transport-shaped message must also originate in a database
  // driver — a fetch failure in a route handler must not be mistaken for one.
  const haystack = `${message}\n${contextMessage}\n${stack}`
  const matchesTransport = TRANSPORT_PATTERNS.some((pattern) => pattern.test(haystack))
  if (!matchesTransport) return false

  return /@neondatabase\/serverless|node_modules\/pg|realtime-js|supabase/.test(haystack)
}

/** Throttle repeated logging: a flapping socket must not flood the log. */
const LOG_INTERVAL_MS = 30_000
let lastLoggedAt = 0

/**
 * Returns true when the failure was handled (degraded). Returns false when the
 * caller must terminate the process.
 */
export function handleUncaughtException(err: unknown): boolean {
  if (isDatabaseTransportFailure(err)) {
    const now = Date.now()
    if (now - lastLoggedAt > LOG_INTERVAL_MS) {
      lastLoggedAt = now
      console.error(
        '[runtime] database transport failure — degraded, server continues:',
        err instanceof Error ? err.message : err,
      )
    }
    return true
  }

  // Unknown failure: preserve Node's crash semantics.
  console.error('[runtime] uncaught exception', err)
  return false
}

let installed = false

/**
 * Installs the guard. Idempotent so both `instrumentation.ts` and any test
 * harness can call it safely.
 */
export function installUncaughtExceptionGuard(): void {
  if (installed) return
  installed = true

  process.on('uncaughtException', (err) => {
    if (handleUncaughtException(err)) return
    process.exit(1)
  })
}
