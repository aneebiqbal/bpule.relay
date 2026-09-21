import { NextResponse } from 'next/server'
import { assertGrowthAccessAPI, GrowthAuthError } from '@/lib/auth/growth'
import { createScoutStore } from '@/lib/store'
import { runDailyEditor } from '@/lib/growth/daily-editor'
import { buildPostPlanFromOpportunity } from '@/lib/growth/post-plan'
import { generatePost } from '@/lib/growth/writing-engine'
import { decideVisual } from '@/lib/growth/visual-decision'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await assertGrowthAccessAPI()
    const store = await createScoutStore()
    const today = new Date().toISOString().slice(0, 10)

    const [memory, events, existingDecision, opportunities] = await Promise.all([
      store.listGrowthMemory(true),
      store.listGrowthEvents(false),
      store.getEditorialDecision(today),
      store.listOpportunities(today),
    ])

    if (existingDecision) {
      const draft = await store.getGrowthDraftByDecision(existingDecision.id)
      return NextResponse.json({
        decision: existingDecision,
        draft,
        opportunities,
        alreadySelected: true,
      })
    }

    if (opportunities.length === 0) {
      return NextResponse.json({
        decision: null,
        draft: null,
        opportunities: [],
        alreadySelected: false,
        message: 'No opportunities generated yet. Run POST /api/growth/opportunities/generate first.',
      })
    }

    const recentDecisions: any[] = []
    const result = runDailyEditor({ opportunities, recentDecisions, today })

    if (!result.primary) {
      return NextResponse.json({
        decision: null,
        draft: null,
        opportunities,
        alreadySelected: false,
        message: 'No suitable opportunity found today.',
      })
    }

    const postPlan = buildPostPlanFromOpportunity(result.primary)
    const writingResult = await generatePost({ opportunity: result.primary, postPlan })
    const visualDecision = decideVisual(postPlan, result.primary)

    const decision = await store.createEditorialDecision({
      decisionDate: today,
      opportunityId: result.primary.id,
      primaryReason: result.reasoning,
      audienceReason: `Targets ${result.primary.audienceSegment.replace(/_/g, ' ')}`,
      timelinessReason: result.whyToday,
      evidenceReason: 'Grounded in actual product evidence',
      takeaway: result.primary.insight,
    })

    const draft = await store.createGrowthDraft({
      decisionId: decision.id,
      opportunityId: result.primary.id,
      postPlan: postPlan as unknown as Record<string, unknown>,
      platform: 'linkedin',
    })

    await store.updateGrowthDraft(draft.id, {
      caption: writingResult.caption,
      hook: writingResult.hook,
      status: 'ready',
      visualType: visualDecision.type,
      visualConcept: visualDecision.imagePrompt,
      qualityScore: writingResult.qualityScore,
      qualityNotes: writingResult.qualityNotes,
    })

    const updatedDraft = await store.getGrowthDraft(draft.id)

    return NextResponse.json({
      decision,
      draft: updatedDraft,
      opportunities,
      alreadySelected: false,
      postPlan,
      visual: visualDecision,
      reasoning: result.reasoning,
      whyToday: result.whyToday,
    })
  } catch (error) {
    if (error instanceof GrowthAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[growth/today] failed:', error)
    return NextResponse.json({ error: 'Failed to load today\'s post.' }, { status: 500 })
  }
}
