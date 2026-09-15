import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

import { scanForSecrets } from '@/lib/ai/secrets'
import {
  type ChainStep,
  type CostTierName,
  buildLongcatDraftChain,
  buildOpenaiDraftChain,
  pickDraftChain,
  tier0Chain,
} from '@/lib/ai/routing'

/**
 * Generation mode controls provider priority.
 *
 * - "standard" (default): LongCat-2.0 is the normal writer. OpenAI only runs
 *   when LongCat fails quality gates and cheaper correction also fails.
 * - "premium": user explicitly selected GPT for extra-important generations.
 *   OpenAI runs first; LongCat is the fallback.
 */
export type GenerationMode = 'standard' | 'premium'

/**
 * AI task categories — determines provider chain and context budget.
 *
 * "write" tasks produce natural-language output (replies, DMs, proposals, posts).
 * "think" tasks are complex reasoning that benefit from LongCat thinking mode.
 * "extract" tasks produce structured JSON (lead fields, classification, etc.).
 */
export type AiTaskKind =
  | 'write'
  | 'think'
  | 'extract'

export interface GenerateOptions {
  /** Task category — determines provider chain and context strategy. */
  task: AiTaskKind
  /** Generation mode — controls provider priority. */
  mode?: GenerationMode
  /** Conversation messages (system + user, etc.). */
  messages: ChatCompletionMessageParam[]
  /** Temperature override (defaults vary by task). */
  temperature?: number
  /** Maximum output tokens (provider hint). */
  maxTokens?: number
  /** Emit streaming text deltas (for real-time UI). */
  onChunk?: (delta: string) => void
  /** Emit status messages (rate limit, fallback, etc.). */
  onStatus?: (message: string) => void
  /** Custom chain override (for specialized callers). */
  chainOverride?: ChainStep[]
  /** Quality gate — if provided, the result is validated and escalation happens automatically. */
  qualityGate?: (text: string) => QualityGateResult
  /** Up to N corrective retries on cheaper models before escalation. */
  maxRetries?: number
}

export interface QualityGateResult {
  passed: boolean
  /** 0-10 score for escalation decisions. */
  score: number
  /** Why the gate failed (for telemetry). */
  reason?: string
}

export interface GenerationResult {
  text: string
  /** Provider that actually served the call. */
  provider: string
  /** Model id that served the call. */
  model: string
  /** Cost tier label. */
  costTier: CostTierName
  /** Generation mode used. */
  generationMode: GenerationMode
  /** Whether a fallback from the primary provider was used. */
  fallbackUsed: boolean
  /** Reason for fallback (if any). */
  fallbackReason: string
  /** Quality gate result (if a gate was provided). */
  qualityGateResult?: QualityGateResult
  /** Token usage (best-effort). */
  tokens: {
    input: number
    output: number
    reasoning: number
  }
  /** Wall-clock latency in ms. */
  latencyMs: number
  /** Estimated cost in USD. */
  estimatedCostUsd: number
  /** Attempts made before success (for debugging). */
  attempts: number
}

// ---------------------------------------------------------------------------
// Provider chain selection
// ---------------------------------------------------------------------------

function selectChain(task: AiTaskKind, mode: GenerationMode): ChainStep[] {
  if (mode === 'premium') {
    // Premium: OpenAI first, LongCat fallback
    return buildOpenaiDraftChain()
  }

  // Standard mode
  switch (task) {
    case 'write':
    case 'think':
      // LongCat primary → Groq strong fallback → OpenAI escalation
      return buildLongcatDraftChain()
    case 'extract':
      // Groq cheap primary for structured tasks (fast, cheap, good enough)
      return tier0Chain('cheap')
    default:
      return pickDraftChain()
  }
}

// ---------------------------------------------------------------------------
// LongCat thinking control
// ---------------------------------------------------------------------------

function shouldEnableThinking(task: AiTaskKind, textLength: number): boolean {
  if (task === 'think') return true
  // Enable thinking for complex writes (>500 chars of context)
  if (task === 'write' && textLength > 500) return true
  return false
}

// ---------------------------------------------------------------------------
// Main generate function
// ---------------------------------------------------------------------------

/**
 * Central AI generation router — LongCat-first by default.
 *
 * Every generation path in Relay should use this function (or a thin wrapper
 * around it). Provider selection happens here, behind the safety guarantees
 * (identity isolation, proof filtering, grounding) that the calling code
 * enforces.
 */
export async function generate(opts: GenerateOptions): Promise<GenerationResult> {
  const startTime = Date.now()
  const mode: GenerationMode = opts.mode ?? 'standard'
  const task = opts.task
  const maxRetries = opts.maxRetries ?? 1

  // Select provider chain
  const chain = opts.chainOverride ?? selectChain(task, mode)

  if (chain.length === 0) {
    throw new Error('No AI provider is configured. Set LONGCAT_API_KEY or GROQ_API_KEY in .env.local.')
  }

  // Secret scan on all messages
  for (const msg of opts.messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '')
    const scan = scanForSecrets(content)
    if (scan.blocked) {
      throw new Error(`Prompt blocked by secret scanner: ${scan.reason}`)
    }
  }

  // Context budget: cap messages for non-think tasks
  const messages = task === 'think'
    ? opts.messages
    : capMessages(opts.messages, mode === 'premium' ? 20 : 12)

  const textLength = messages.reduce((sum, m) => {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
    return sum + c.length
  }, 0)

  const thinking = shouldEnableThinking(task, textLength)

  // Attempt generation with fallback across the chain
  const attempts: Array<{ provider: string; model: string; tier: CostTierName; error?: string }> = []
  let lastError = ''

  for (let retry = 0; retry <= maxRetries; retry++) {
    for (const step of chain) {
      const stepStart = Date.now()
      try {
        const result = await attemptOnHost(step, messages, {
          temperature: opts.temperature ?? defaultTemperature(task),
          maxTokens: opts.maxTokens,
          onChunk: opts.onChunk,
          onStatus: opts.onStatus,
          thinking: thinking && step.host.id === 'longcat',
        })

        attempts.push({
          provider: step.host.id,
          model: step.host.model,
          tier: step.costTier,
        })

        // Quality gate check (standard mode only — premium already used GPT)
        let qualityGateResult: QualityGateResult | undefined
        if (opts.qualityGate && mode === 'standard') {
          qualityGateResult = opts.qualityGate(result.text)
          if (!qualityGateResult.passed && retry < maxRetries) {
            // Try corrective retry on next cheaper host
            lastError = qualityGateResult.reason ?? 'quality_gate_failed'
            attempts[attempts.length - 1].error = lastError
            continue
          }
        }

        const latency = Date.now() - startTime
        const fallbackUsed = attempts.length > 1

        return {
          text: result.text,
          provider: step.host.id,
          model: step.host.model,
          costTier: step.costTier,
          generationMode: mode,
          fallbackUsed,
          fallbackReason: fallbackUsed ? lastError : '',
          qualityGateResult,
          tokens: {
            input: result.inputTokens,
            output: result.outputTokens,
            reasoning: result.reasoningTokens,
          },
          latencyMs: latency,
          estimatedCostUsd: result.estimatedCostUsd,
          attempts: attempts.length,
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        attempts.push({
          provider: step.host.id,
          model: step.host.model,
          tier: step.costTier,
          error: lastError,
        })
        opts.onStatus?.(`${step.host.id} unavailable (${lastError}); trying next`)
      }
    }
  }

  throw new Error(`All AI providers failed after ${attempts.length} attempts. Last error: ${lastError}`)
}

// ---------------------------------------------------------------------------
// Host-level attempt
// ---------------------------------------------------------------------------

interface AttemptResult {
  text: string
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  estimatedCostUsd: number
}

async function attemptOnHost(
  step: ChainStep,
  messages: ChatCompletionMessageParam[],
  opts: {
    temperature?: number
    maxTokens?: number
    onChunk?: (delta: string) => void
    onStatus?: (message: string) => void
    thinking?: boolean
  },
): Promise<AttemptResult> {
  const { default: OpenAI } = await import('openai')
  const { estimateCostUsd, estimateTokens } = await import('@/lib/ai/cost')

  if (!step.host.apiKey) {
    throw new Error(`Host ${step.host.id} has no API key`)
  }

  const api = new OpenAI({
    apiKey: step.host.apiKey,
    baseURL: step.host.baseUrl,
    timeout: 60_000,
  })

  // Build request parameters
  const params: Record<string, unknown> = {
    model: step.host.model,
    messages,
    temperature: opts.temperature ?? 0.7,
    stream: !!opts.onChunk,
  }

  if (opts.maxTokens) {
    params.max_tokens = opts.maxTokens
  }

  // LongCat thinking mode
  if (opts.thinking && step.host.id === 'longcat') {
    params.thinking = { type: 'enabled' }
  }

  if (opts.onChunk) {
    // Streaming
    const stream = await api.chat.completions.create({
      ...params,
      stream: true,
    } as never)
    let full = ''
    let reasoningContent = ''
    for await (const chunk of stream as unknown as AsyncIterable<{ choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }> }>) {
      const delta = chunk.choices?.[0]?.delta?.content ?? ''
      const reasoning = chunk.choices?.[0]?.delta?.reasoning_content ?? ''
      if (delta) {
        full += delta
        opts.onChunk(delta)
      }
      if (reasoning) {
        reasoningContent += reasoning
      }
    }

    const inputTokens = estimateTokens(messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' '))
    const outputTokens = estimateTokens(full)
    const reasoningTokens = estimateTokens(reasoningContent)

    return {
      text: full,
      inputTokens,
      outputTokens,
      reasoningTokens,
      estimatedCostUsd: estimateCostUsd(step.costTier, inputTokens, outputTokens),
    }
  } else {
    // Non-streaming
    const completion = await api.chat.completions.create(params as never)
    const text = completion.choices[0]?.message?.content ?? ''
    const reasoningContent = (completion.choices?.[0]?.message as { reasoning_content?: string } | undefined)?.reasoning_content ?? ''

    const inputTokens = completion.usage?.prompt_tokens ?? estimateTokens(messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' '))
    const outputTokens = completion.usage?.completion_tokens ?? estimateTokens(text)
    const reasoningTokens = estimateTokens(reasoningContent)

    return {
      text,
      inputTokens,
      outputTokens,
      reasoningTokens,
      estimatedCostUsd: estimateCostUsd(step.costTier, inputTokens, outputTokens),
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultTemperature(task: AiTaskKind): number {
  switch (task) {
    case 'write':
      return 0.7
    case 'think':
      return 0.5
    case 'extract':
      return 0.1
    default:
      return 0.7
  }
}

function capMessages(messages: ChatCompletionMessageParam[], maxCount: number): ChatCompletionMessageParam[] {
  if (messages.length <= maxCount) return messages

  // Always keep the system message (first), then take the most recent messages
  const systemMsgs = messages.filter((m) => m.role === 'system')
  const otherMsgs = messages.filter((m) => m.role !== 'system')

  const capped = otherMsgs.slice(-(maxCount - systemMsgs.length))
  return [...systemMsgs, ...capped]
}
