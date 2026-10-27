/**
 * Request trace context (Phase 16/17).
 *
 * One request id per user action, carried through every AI call in that request
 * without threading a parameter through each layer. Ids only — never raw source
 * text, client messages, emails or phone numbers.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

export interface TraceContext {
  requestId: string
  organizationId?: string | null
  leadId?: string | null
  jobId?: string | null
  repId?: string | null
  decisionRunId?: string | null
}

const storage = new AsyncLocalStorage<TraceContext>()

/** Run a function with a trace context visible to every nested AI call. */
export function runWithTraceContext<T>(ctx: TraceContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

/** The current request's trace context, when inside a scoped request. */
export function getTraceContext(): TraceContext | undefined {
  return storage.getStore()
}

/** A new correlation id for one user request. */
export function newRequestId(): string {
  return randomUUID()
}

/** Merge new ids into the current context (e.g. a lead created mid-request). */
export function extendTraceContext(patch: Partial<TraceContext>): TraceContext | undefined {
  const current = storage.getStore()
  if (!current) return undefined
  return { ...current, ...patch }
}
