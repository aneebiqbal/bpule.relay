import { NextResponse } from 'next/server'
import { generatePostImage } from '@/lib/ai/fal-image'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!process.env.FAL_API_KEY) {
    return NextResponse.json({ status: 'no_key', message: 'FAL_API_KEY not set' })
  }

  try {
    const result = await generatePostImage(
      'A clean minimalist workspace with a laptop showing code, soft natural light, professional photography',
      { aspectRatio: '16:9' }
    )
    return NextResponse.json({ status: 'ok', url: result.url, seed: result.seed })
  } catch (err) {
    return NextResponse.json({ status: 'error', message: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}
