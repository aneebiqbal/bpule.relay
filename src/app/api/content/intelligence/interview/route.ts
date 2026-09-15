import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { safeErrorResponse } from '@/lib/errors'
import { decideIfInterviewNeeded, generateInterviewQuestion, shouldStopInterview, assessAnswerQuality, MAX_INTERVIEW_QUESTIONS } from '@/lib/content/intelligence/interview'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/intelligence/interview
 * Body: { personaId, sourceMaterial, opportunityId?, sessionId?, previousAnswer?, previousQuestion? }
 * Returns: { done: boolean, question?, reason?, sessionId, questionsAsked?, maxQuestions? }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { personaId, sourceMaterial, opportunityId, sessionId, previousAnswer, previousQuestion } = body as {
      personaId: string
      sourceMaterial: string
      opportunityId?: string | null
      sessionId?: string | null
      previousAnswer?: string | null
      previousQuestion?: string | null
    }

    const store = await createScoutStore()
    const persona = await store.getContentPersona(personaId)
    if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const profile = persona.contentProfileId ? await store.getContentProfile(persona.contentProfileId) : null
    const memories = await store.listContentMemories(personaId, { limit: 50 })
    let opportunity = opportunityId ? await store.getContentOpportunity(opportunityId) : null
    if (opportunity && opportunity.personaId !== personaId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    if (!opportunity && sourceMaterial) {
      opportunity = await store.createContentOpportunity({
        personaId,
        opportunityType: 'recent_work',
        title: 'Your recent work',
        description: sourceMaterial.slice(0, 200),
        trigger: 'User provided source material',
        sourceKind: 'user_input',
      })
    }

    let session = sessionId ? await store.getInterviewSession(sessionId) : null
    if (session && session.personaId !== personaId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    if (!session) {
      session = await store.createInterviewSession({
        personaId,
        opportunityId: opportunity?.id ?? null,
        sessionType: 'opportunity_exploration',
      })
    }

    if (previousAnswer && previousQuestion) {
      const quality = assessAnswerQuality(previousAnswer, sourceMaterial)
      await store.createInterviewAnswer({
        sessionId: session.id,
        question: previousQuestion,
        answer: previousAnswer,
        informationGain: quality === 'high' ? 0.4 : quality === 'medium' ? 0.2 : 0.05,
      })
      await store.updateInterviewSession(session.id, {
        questionsAsked: session.questionsAsked + 1,
        informationGain: session.informationGain + (quality === 'high' ? 0.4 : quality === 'medium' ? 0.2 : 0.05),
      })
      session = (await store.getInterviewSession(session.id)) ?? session
    }

    const decision = decideIfInterviewNeeded({ profile, memories, sourceMaterial, opportunity })

    if (!decision.shouldInterview) {
      await store.updateInterviewSession(session.id, { status: 'completed', completedAt: new Date().toISOString() })
      return NextResponse.json({ done: true, reason: decision.reason, sessionId: session.id })
    }

    const answers = await store.listInterviewAnswers(session.id)
    const lastAnswer = answers[answers.length - 1]
    const lastQuality = lastAnswer ? assessAnswerQuality(lastAnswer.answer, sourceMaterial) : 'low'
    const stopDecision = shouldStopInterview({
      questionsAsked: session.questionsAsked,
      lastAnswerQuality: lastQuality,
      informationGain: session.informationGain,
      missingDimensionsRemaining: decision.missingDimensions.length,
    })

    if (stopDecision.shouldStop) {
      await store.updateInterviewSession(session.id, { status: 'completed', completedAt: new Date().toISOString() })
      return NextResponse.json({ done: true, reason: stopDecision.reason, sessionId: session.id })
    }

    const answersList = await store.listInterviewAnswers(session.id)
    const question = await generateInterviewQuestion({
      profile,
      memories,
      sourceMaterial,
      opportunity,
      previousAnswers: answersList,
      missingDimensions: decision.missingDimensions,
    })

    if (!question.question) {
      await store.updateInterviewSession(session.id, { status: 'completed', completedAt: new Date().toISOString() })
      return NextResponse.json({ done: true, reason: 'No more useful questions.', sessionId: session.id })
    }

    return NextResponse.json({
      done: false,
      question: question.question,
      reason: question.reason,
      sessionId: session.id,
      questionsAsked: session.questionsAsked,
      maxQuestions: MAX_INTERVIEW_QUESTIONS,
    })
  } catch (err) {
    console.error('[content/intelligence/interview] failed:', err)
    return safeErrorResponse(err, 500, 'Interview failed.', 'content/intelligence/interview')
  }
}
