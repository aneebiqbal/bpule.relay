/**
 * Scout model configuration.
 *
 * Every model id used anywhere in the app must be resolved through this
 * module, so a provider swap or a routing change stays a one-line edit.
 * Defaults target Groq's fast inference models and can be overridden with
 * env vars so spend stays a deployment decision.
 */
export function groqApiKey(): string | undefined {
  return process.env.GROQ_API_KEY
}

export function groqBaseUrl(): string {
  return process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1'
}

export function hasProvider(): boolean {
  return Boolean(groqApiKey())
}

/** Cheapest capable model: extraction, classification, calibration. */
export function cheapModel(): string {
  return process.env.SCOUT_CHEAP_MODEL ?? 'llama-3.1-8b-instant'
}

/** Stronger model: drafting and self-check retries. */
export function strongModel(): string {
  return process.env.SCOUT_STRONG_MODEL ?? 'llama-3.3-70b-versatile'
}

export function dbMode(): 'supabase' | 'demo' {
  const override = process.env.SCOUT_DB
  if (override === 'supabase' || override === 'demo') return override
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return 'supabase'
  }
  return 'demo'
}

export function isDemoMode(): boolean {
  return dbMode() === 'demo'
}

/** Per-rep daily send ceiling (Part 7 rule). */
export function dailySendLimit(): number {
  const raw = Number(process.env.SCOUT_DAILY_SEND_LIMIT ?? '15')
  return Number.isFinite(raw) && raw > 0 ? raw : 15
}

/**
 * Per-type daily ceilings, enforced server-side, not just in the UI.
 *
 *   dm / followup  -> dailySendLimit()      (15 by default)
 *   connection / upwork -> dailyConnectionSendLimit()   (20 by default)
 *
 * Inbound reply drafting has no ceiling.
 */
export function dailyConnectionSendLimit(): number {
  const raw = Number(process.env.SCOUT_DAILY_CONNECTION_LIMIT ?? '20')
  return Number.isFinite(raw) && raw > 0 ? raw : 20
}

export function messageTypeLimit(type: string): number {
  return type === 'connection' || type === 'upwork'
    ? dailyConnectionSendLimit()
    : dailySendLimit()
}

/** Published team targets. */
export const REPLY_RATE_TARGET = 0.15
export const READ_TO_CHECK_TARGET = 0.25