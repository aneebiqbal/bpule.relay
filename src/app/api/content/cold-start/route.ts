import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { generateColdStartQuestion } from '@/lib/ai/cold-start'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/cold-start — generate the next adaptive cold-start
 * question based on all previous answers. The client tracks the answer
 * history and sends it back each time to get the next question.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const profileInput = typeof body.profileInput === 'string' ? body.profileInput : ''
  const previousAnswers = Array.isArray(body.previousAnswers) ? body.previousAnswers : []
  const depth = typeof body.depth === 'number' ? body.depth : previousAnswers.length

  try {
    const question = await generateColdStartQuestion({
      profileInput,
      previousAnswers,
      depth,
    })
    return NextResponse.json({ question })
  } catch {
    return NextResponse.json({ question: { id: `cs${depth}`, prompt: '', kind: 'choice', options: [], depth, done: true } })
  }
}
