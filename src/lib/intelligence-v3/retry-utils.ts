/**
 * Retry utility for V3 API calls.
 *
 * Retries transient failures (rate limits, server errors, timeouts)
 * with exponential backoff.
 */

export interface RetryOptions {
  maxRetries: number
  baseDelayMs: number
  retryOn?: RegExp
}

const DEFAULT_RETRY_PATTERN = /429|500|502|503|504|timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND/i

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
  isRetryable: (error: unknown) => boolean = () => true,
): Promise<T> {
  const retryPattern = opts.retryOn || DEFAULT_RETRY_PATTERN
  let lastError: unknown

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const errorStr = String(e)

      const shouldRetry = attempt < opts.maxRetries &&
        isRetryable(e) &&
        retryPattern.test(errorStr)

      if (!shouldRetry) throw e

      const delay = opts.baseDelayMs * (attempt + 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

export async function fetchOpenAI(
  apiKey: string,
  model: string,
  baseUrl: string,
  systemPrompt: string,
  userPrompt: string,
  schema: object,
  maxTokens: number = 2000,
): Promise<{ data: string | null; error: string | null; status: number }> {
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'v3_call', schema, strict: true },
        },
        temperature: 0.1,
        max_tokens: maxTokens,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      return { data: null, error: `HTTP ${response.status}: ${body.slice(0, 200)}`, status: response.status }
    }

    const json = await response.json() as { choices: Array<{ message: { content: string } }> }
    const content = json.choices?.[0]?.message?.content
    if (!content) return { data: null, error: 'empty response', status: 200 }
    return { data: content, error: null, status: 200 }
  } catch (e) {
    return { data: null, error: String(e), status: 0 }
  }
}
