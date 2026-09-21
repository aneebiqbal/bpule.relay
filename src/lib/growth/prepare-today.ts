import type { ScoutStore } from '@/lib/store/types'
import type { RelayContentOpportunity, RelayEditorialDecision, RelayGrowthDraft } from '@/lib/domain/types'
import { runDailyEditor } from '@/lib/growth/daily-editor'
import { buildPostPlanFromOpportunity } from '@/lib/growth/post-plan'
import { generateFallbackPost } from '@/lib/growth/writing-engine'
import { decideVisual } from '@/lib/growth/visual-decision'

export interface PreparedToday {
  decision: RelayEditorialDecision | null
  draft: RelayGrowthDraft | null
  opportunities: RelayContentOpportunity[]
}

export async function prepareTodaysPost(
  store: ScoutStore,
  options: { opportunityId?: string } = {},
): Promise<PreparedToday> {
  const today = new Date().toISOString().slice(0, 10)
  const opportunities = await store.listOpportunities(today)
  const existingDecision = await store.getEditorialDecision(today)

  if (existingDecision) {
    const draft = await store.getGrowthDraftByDecision(existingDecision.id)
    return { decision: existingDecision, draft, opportunities }
  }

  if (opportunities.length === 0) {
    return { decision: null, draft: null, opportunities }
  }

  const chosen =
    (options.opportunityId
      ? opportunities.find((opp) => opp.id === options.opportunityId)
      : null) ?? runDailyEditor({ opportunities, recentDecisions: [], today }).primary

  if (!chosen) {
    return { decision: null, draft: null, opportunities }
  }

  const editor = runDailyEditor({ opportunities, recentDecisions: [], today })
  const postPlan = buildPostPlanFromOpportunity(chosen)
  const caption = generateFallbackPost(postPlan)
  const hook = chosen.title
  const qualityScore = 70
  const qualityNotes = ['Drafted from product evidence']

  const visualDecision = decideVisual(postPlan, chosen)
  await store.selectOpportunity(chosen.id, today)

  const decision = await store.createEditorialDecision({
    decisionDate: today,
    opportunityId: chosen.id,
    primaryReason: editor.reasoning,
    audienceReason: `Targets ${chosen.audienceSegment.replace(/_/g, ' ')}`,
    timelinessReason: editor.whyToday,
    evidenceReason: 'Grounded in actual product evidence',
    takeaway: chosen.insight,
  })

  const draft = await store.createGrowthDraft({
    decisionId: decision.id,
    opportunityId: chosen.id,
    postPlan: postPlan as unknown as Record<string, unknown>,
    platform: 'linkedin',
  })

  await store.updateGrowthDraft(draft.id, {
    caption,
    hook,
    status: 'ready',
    visualType: visualDecision.type,
    visualConcept: visualDecision.imagePrompt,
    qualityScore,
    qualityNotes,
  })

  const updatedDraft = await store.getGrowthDraft(draft.id)
  return {
    decision,
    draft: updatedDraft,
    opportunities: await store.listOpportunities(today),
  }
}
