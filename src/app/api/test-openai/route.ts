import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const key = process.env.OPENAI_API_KEY
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 503 })

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (res.ok) {
      return NextResponse.json({ status: 'ok', message: 'OpenAI key is valid' })
    }
    const err = await res.text()
    return NextResponse.json({ status: 'invalid', message: `OpenAI returned ${res.status}`, detail: err.slice(0, 200) }, { status: 401 })
  } catch (err) {
    return NextResponse.json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}
