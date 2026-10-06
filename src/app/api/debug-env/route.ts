import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const hasOpenAi = !!process.env.OPENAI_API_KEY
  const hasOpenAiImage = !!process.env.OPENAI_API_KEY_IMAGE
  const preferred = process.env.SCOUT_AI_PREFERRED_PROVIDER || 'auto'

  return NextResponse.json({
    status: 'ok',
    env: {
      OPENAI_API_KEY: hasOpenAi ? `set (${process.env.OPENAI_API_KEY?.slice(0, 8)}...)` : 'MISSING',
      OPENAI_API_KEY_IMAGE: hasOpenAiImage ? `set (${process.env.OPENAI_API_KEY_IMAGE?.slice(0, 8)}...)` : 'MISSING',
      SCOUT_AI_PREFERRED_PROVIDER: preferred,
    },
  })
}
