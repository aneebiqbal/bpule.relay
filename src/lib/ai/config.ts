/**
 * Scout model configuration — architecture v2.1 (September 2026).
 *
 * Every provider host and model id used anywhere in the app must be resolved
 * through this module, so a provider swap or a routing change stays a
 * one-line edit.
 *
 * Groq's free tier (no card required, 30 req/min, 14,400 req/day — verified
 * against Groq's published limits, not a trial) is tier 0 and primary for
 * extraction and standard drafting: it's free, and its rate limits are
 * generous enough that a five-person team is unlikely to hit them on a
 * normal day. DeepSeek V4 (multi-host) and OpenAI sit one level down as paid
 * escalation, unchanged in their own internal structure from the prior
 * architecture pass — they now fire only when Groq's own daily/per-minute
 * ceiling is actually hit, or the confidence gate/self-check fails on a Groq
 * response and the existing escalation trigger applies. An OpenRouter tier
 * was considered and deliberately dropped: OpenRouter's free tier requires a
 * one-time $10 real payment just to raise its daily cap from 50 to 1,000
 * requests, which is strictly worse than Groq's free tier for a team that
 * already has Groq working. If Groq's free tier is ever actually exhausted
 * in practice, the fix is adding a card to the existing Groq account (its
 * paid Developer tier is still a fraction of a cent per call), not adding a
 * third provider.
 *
 * Every id is env-overridable so spend and provider choice stay a deployment
 * decision, not a code change.
 */

export interface ProviderHost {
  /** Stable id used in logs/metrics — never the raw model string, so a host swap doesn't break historical queries. */
  id: string
  apiKey: string | undefined
  baseUrl: string
  /** The model id as this specific host names it (hosts sometimes prefix/rename the same weights). */
  model: string
}

// ============================================================================
// Tier 0 — Groq, free, primary. No card required; a different model family
// on different infrastructure from DeepSeek/OpenAI below it, so a Groq-side
// issue and a DeepSeek-side issue are genuinely independent failure modes.
// ============================================================================

export function groqApiKey(): string | undefined {
  return process.env.GROQ_API_KEY
}

export function groqBaseUrl(): string {
  return process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1'
}

export function groqCheapModel(): string {
  return process.env.SCOUT_TIER0_CHEAP_MODEL ?? process.env.SCOUT_TIER3_CHEAP_MODEL ?? 'openai/gpt-oss-20b'
}

export function groqStrongModel(): string {
  return process.env.SCOUT_TIER0_STRONG_MODEL ?? process.env.SCOUT_TIER3_STRONG_MODEL ?? 'openai/gpt-oss-120b'
}

export function tier0Host(kind: 'cheap' | 'strong'): ProviderHost | null {
  if (!groqApiKey()) return null
  return {
    id: 'groq',
    apiKey: groqApiKey(),
    baseUrl: groqBaseUrl(),
    model: kind === 'strong' ? groqStrongModel() : groqCheapModel(),
  }
}

// ============================================================================
// Tier 1 — DeepSeek V4 Flash, multi-host. Same weights served by two
// independent providers; the host retry lives in provider.ts, not here.
// First paid escalation once tier 0 (Groq) is actually exhausted or fails
// its own retry budget — structurally identical to the prior architecture
// pass, just one level down instead of primary.
// ============================================================================

export function deepseekOfficialApiKey(): string | undefined {
  return process.env.DEEPSEEK_API_KEY
}

export function deepseekOfficialBaseUrl(): string {
  return process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1'
}

export function fireworksApiKey(): string | undefined {
  return process.env.FIREWORKS_API_KEY
}

export function fireworksBaseUrl(): string {
  return process.env.FIREWORKS_BASE_URL ?? 'https://api.fireworks.ai/inference/v1'
}

/** Tier 1 model id, per host — DeepSeek and Fireworks name the same weights slightly differently. */
export function deepseekFlashModel(): string {
  return process.env.SCOUT_TIER1_MODEL ?? 'deepseek-chat'
}

export function fireworksFlashModel(): string {
  return process.env.SCOUT_TIER1_FIREWORKS_MODEL ?? 'accounts/fireworks/models/deepseek-v4-flash'
}

/** Tier 1 hosts, in try-order. Only hosts with a configured key are considered live. */
export function tier1Hosts(): ProviderHost[] {
  const hosts: ProviderHost[] = []
  if (deepseekOfficialApiKey()) {
    hosts.push({
      id: 'deepseek-official',
      apiKey: deepseekOfficialApiKey(),
      baseUrl: deepseekOfficialBaseUrl(),
      model: deepseekFlashModel(),
    })
  }
  if (fireworksApiKey()) {
    hosts.push({
      id: 'fireworks',
      apiKey: fireworksApiKey(),
      baseUrl: fireworksBaseUrl(),
      model: fireworksFlashModel(),
    })
  }
  return hosts
}

// ============================================================================
// Tier 2 — DeepSeek V4 Pro, escalation only. Same official host as tier 1;
// Fireworks also serves it, kept as a second host for the same reason.
// ============================================================================

export function deepseekProModel(): string {
  return process.env.SCOUT_TIER2_MODEL ?? 'deepseek-reasoner'
}

export function fireworksProModel(): string {
  return process.env.SCOUT_TIER2_FIREWORKS_MODEL ?? 'accounts/fireworks/models/deepseek-v4-pro'
}

export function tier2Hosts(): ProviderHost[] {
  const hosts: ProviderHost[] = []
  if (deepseekOfficialApiKey()) {
    hosts.push({
      id: 'deepseek-official',
      apiKey: deepseekOfficialApiKey(),
      baseUrl: deepseekOfficialBaseUrl(),
      model: deepseekProModel(),
    })
  }
  if (fireworksApiKey()) {
    hosts.push({
      id: 'fireworks',
      apiKey: fireworksApiKey(),
      baseUrl: fireworksBaseUrl(),
      model: fireworksProModel(),
    })
  }
  return hosts
}

// ============================================================================
// Tier 4 — OpenAI, final safety net. Fires only if tier 0 (Groq) and every
// tier 1/2 (DeepSeek) host have failed. There is no prior OpenAI chat
// fallback in this codebase to "restore" — this is new, added specifically
// as the last-resort tier.
// ============================================================================

export function openaiApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY
}

export function openaiBaseUrl(): string {
  return process.env.OPENAI_CHAT_BASE_URL ?? 'https://api.openai.com/v1'
}

export function openaiModel(): string {
  return process.env.SCOUT_TIER4_MODEL ?? 'gpt-4o-mini'
}

export function tier4Host(): ProviderHost | null {
  if (!openaiApiKey()) return null
  return {
    id: 'openai',
    apiKey: openaiApiKey(),
    baseUrl: openaiBaseUrl(),
    model: openaiModel(),
  }
}

/** True once at least one tier has a usable key; false only in demo mode. */
export function hasProvider(): boolean {
  return (
    tier1Hosts().length > 0 ||
    tier2Hosts().length > 0 ||
    Boolean(groqApiKey()) ||
    Boolean(openaiApiKey())
  )
}

// ============================================================================
// Off-peak scheduling. DeepSeek prices roughly double during peak hours;
// batch-eligible jobs (eval harness run, few-shot pool refresh) should run
// outside this window to capture the discount automatically. Per the
// September 2026 research pass, peak is 01:00-04:00 and 06:00-10:00 UTC.
// ============================================================================

export function deepseekPeakWindowsUtc(): Array<{ startHour: number; endHour: number }> {
  return [
    { startHour: 1, endHour: 4 },
    { startHour: 6, endHour: 10 },
  ]
}

export function isDeepseekPeakHour(date: Date = new Date()): boolean {
  const hour = date.getUTCHours()
  return deepseekPeakWindowsUtc().some((w) => hour >= w.startHour && hour < w.endHour)
}

// ============================================================================
// Legacy single-model accessors, kept only for call sites not yet migrated
// to the tier chain (see routing.ts pickModelChain). New code should route
// through pickModelChain, never these directly.
// ============================================================================

/** @deprecated use pickModelChain('classify') — kept for the calibration/role-fallback call sites. */
export function cheapModel(): string {
  return process.env.SCOUT_CHEAP_MODEL ?? groqCheapModel()
}

/** @deprecated use pickModelChain('draft') — kept until every drafting call site is migrated. */
export function strongModel(): string {
  return process.env.SCOUT_STRONG_MODEL ?? groqStrongModel()
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

/** Embedding model for semantic proof matching. Unrelated to the chat-completion tiers above. */
export function embeddingModel(): string {
  return process.env.SCOUT_EMBEDDING_MODEL ?? 'text-embedding-3-small'
}

export function embeddingApiKey(): string | undefined {
  return process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.GROQ_API_KEY
}

export function embeddingBaseUrl(): string {
  return process.env.EMBEDDING_BASE_URL ?? 'https://api.openai.com/v1'
}

export function hasEmbeddingProvider(): boolean {
  return Boolean(embeddingApiKey())
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
