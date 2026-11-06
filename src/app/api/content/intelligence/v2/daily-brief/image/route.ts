import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { imageFailureReason, imageRegenerationOutcome } from '@/lib/content/image-failure'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const prompt = body.prompt as string
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  const apiKey = process.env.OPENAI_API_KEY_IMAGE || process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Image generation not configured' }, { status: 503 })

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: prompt.slice(0, 4000),
        n: 1,
        size: '1536x1024',
        quality: 'high',
      }),
    })

    if (!res.ok) {
      await res.text()
      return NextResponse.json({ error: imageFailureReason(res.status) }, { status: 502 })
    }

    const json = await res.json()
    const item = json.data?.[0]
    const imageUrl = item?.b64_json
      ? `data:image/png;base64,${item.b64_json}`
      : item?.url

    // The one decision a regeneration makes: only a successful response carrying
    // a URL replaces the existing image. Any failure keeps it and reports why.
    const outcome = imageRegenerationOutcome(res.status, imageUrl)
    if (outcome.keepExisting) {
      return NextResponse.json({ error: outcome.reason }, { status: 502 })
    }

    return NextResponse.json({ url: imageUrl })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
