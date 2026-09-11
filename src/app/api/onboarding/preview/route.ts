import { NextResponse } from 'next/server'
import { calibrateStyleCard } from '@/lib/style/calibrate'
import { DEFAULT_QUIZ, type QuizAnswers } from '@/lib/style/quiz'
import { getCurrentUser } from '@/lib/auth/current'

function parseQuiz(maybe: unknown): QuizAnswers | null {
  if (!maybe || typeof maybe !== 'object') return null
  const q = maybe as Record<string, unknown>
  if (
    typeof q.contractions !== 'string' ||
    typeof q.formality !== 'number' ||
    typeof q.sentenceLength !== 'string' ||
    typeof q.punctuation !== 'string' ||
    typeof q.openers !== 'string'
  ) {
    return null
  }
  return {
    contractions: q.contractions as QuizAnswers['contractions'],
    formality: Math.round(q.formality) as QuizAnswers['formality'],
    sentenceLength: q.sentenceLength as QuizAnswers['sentenceLength'],
    punctuation: q.punctuation as QuizAnswers['punctuation'],
    openers: q.openers as QuizAnswers['openers'],
    emoji: (q.emoji as QuizAnswers['emoji']) ?? DEFAULT_QUIZ.emoji,
    greeting: typeof q.greeting === 'string' ? q.greeting : '',
    signOff: typeof q.signOff === 'string' ? q.signOff : '',
    neverWords: typeof q.neverWords === 'string' ? q.neverWords : '',
    preferredWords: typeof q.preferredWords === 'string' ? q.preferredWords : '',
  }
}

/**
 * Returns a style card without saving it, so a rep can confirm it sounds like
 * them before it is stored.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: { quiz?: unknown; samples?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const quiz = parseQuiz(body.quiz)
  if (!quiz) {
    return NextResponse.json(
      { error: 'Quiz answers are missing or malformed.' },
      { status: 400 },
    )
  }

  const result = await calibrateStyleCard({
    quiz,
    samples: typeof body.samples === 'string' ? body.samples : '',
  })

  return NextResponse.json({
    card: result.card,
    sampleSource: result.sampleSource,
  })
}