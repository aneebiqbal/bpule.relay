import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: { timestamp: string; providers: Record<string, unknown>; environment: Record<string, string | undefined> } = {
    timestamp: new Date().toISOString(),
    providers: {},
    environment: {},
  }

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    results.providers.openai = { status: 'NO_KEY', message: 'OPENAI_API_KEY not set in environment' }
  } else {
    try {
      const start = Date.now()
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${openaiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      const latency = Date.now() - start

      if (res.ok) {
        const data = (await res.json()) as { data: { id: string }[] }
        const hasGpt = data.data?.some(m => m.id.startsWith('gpt-'))
        const hasImage = data.data?.some(m => m.id.includes('image') || m.id.includes('dall'))
        results.providers.openai = {
          status: 'OK',
          latencyMs: latency,
          hasTextModels: hasGpt,
          hasImageModels: hasImage,
          keyPrefix: openaiKey.slice(0, 8) + '...',
        }
      } else {
        const body = await res.text().catch(() => '')
        const errorType = res.status === 401 ? 'AUTH_ERROR'
          : res.status === 403 ? 'FORBIDDEN'
          : res.status === 429 ? 'RATE_LIMIT'
          : res.status >= 500 ? 'UPSTREAM_5XX'
          : 'UNKNOWN'
        results.providers.openai = {
          status: 'FAILED',
          httpStatus: res.status,
          errorType,
          latencyMs: latency,
          detail: body.slice(0, 200),
          keyPrefix: openaiKey.slice(0, 8) + '...',
        }
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError'
      results.providers.openai = {
        status: 'ERROR',
        errorType: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Unknown',
      }
    }
  }

  const imageKey = process.env.OPENAI_API_KEY_IMAGE || process.env.OPENAI_API_KEY
  if (!imageKey) {
    results.providers.openai_image = { status: 'NO_KEY' }
  } else {
    try {
      const start = Date.now()
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${imageKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: 'A simple test image: blue circle on white background',
          n: 1,
          size: '1024x1024',
        }),
        signal: AbortSignal.timeout(30_000),
      })
      const latency = Date.now() - start

      if (res.ok) {
        results.providers.openai_image = {
          status: 'OK',
          latencyMs: latency,
          keyPrefix: imageKey.slice(0, 8) + '...',
        }
      } else {
        const body = await res.text().catch(() => '')
        results.providers.openai_image = {
          status: 'FAILED',
          httpStatus: res.status,
          errorType: res.status === 401 ? 'AUTH_ERROR' : res.status === 429 ? 'RATE_LIMIT' : 'UPSTREAM_5XX',
          latencyMs: latency,
          detail: body.slice(0, 200),
        }
      }
    } catch (err) {
      results.providers.openai_image = {
        status: 'ERROR',
        errorType: err instanceof Error && err.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Unknown',
      }
    }
  }

  const longcatKey = process.env.LONGCAT_API_KEY
  if (!longcatKey) {
    results.providers.longcat = { status: 'NO_KEY', message: 'LONGCAT_API_KEY not set' }
  } else {
    try {
      const start = Date.now()
      const baseUrl = process.env.LONGCAT_BASE_URL || 'https://api.longcat.chat/openai/v1'
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${longcatKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      const latency = Date.now() - start
      results.providers.longcat = {
        status: res.ok ? 'OK' : 'FAILED',
        httpStatus: res.status,
        latencyMs: latency,
        baseUrl,
        keyPrefix: longcatKey.slice(0, 8) + '...',
      }
    } catch (err) {
      results.providers.longcat = {
        status: 'ERROR',
        errorType: err instanceof Error && err.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Unknown',
      }
    }
  }

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    results.providers.groq = { status: 'NO_KEY' }
  } else {
    try {
      const start = Date.now()
      const baseUrl = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${groqKey}` },
        signal: AbortSignal.timeout(10_000),
      })
      const latency = Date.now() - start
      if (res.ok) {
        results.providers.groq = { status: 'OK', latencyMs: latency, baseUrl }
      } else {
        const body = await res.text().catch(() => '')
        results.providers.groq = {
          status: 'FAILED',
          httpStatus: res.status,
          errorType: res.status === 401 ? 'AUTH_ERROR' : res.status === 429 ? 'RATE_LIMIT' : 'UPSTREAM_5XX',
          latencyMs: latency,
          detail: body.slice(0, 200),
        }
      }
    } catch (err) {
      results.providers.groq = {
        status: 'ERROR',
        errorType: err instanceof Error && err.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Unknown',
      }
    }
  }

  results.environment = {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    region: process.env.VERCEL_REGION || 'unknown',
    preferredProvider: process.env.SCOUT_AI_PREFERRED_PROVIDER || 'auto',
  }

  return NextResponse.json(results)
}
