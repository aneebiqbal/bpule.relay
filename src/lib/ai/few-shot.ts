import type { Play } from '@/lib/domain/types'
import type { DraftInput } from '@/lib/ai/draft'
import { pickPlayForSignal } from '@/lib/score/plays'

export interface FewShotExample {
  id: string
  company: string
  signalEvidence: string | null
  sentText: string
  tags: string[]
  playId: string | null
  signalType: number | null
}

export interface FewShotSelection {
  examples: FewShotExample[]
  reason: string
}

/**
 * Select up to two few-shot examples from the win pool that best match the
 * current lead. Matches are ranked by:
 *   1. Same play
 *   2. Same signal type
 *   3. Tag overlap
 *
 * The pool is refreshed automatically from real reply data (see
 * refresh_few_shot_wins() in the migration), so examples never go stale.
 */
export function selectFewShotExamples(
  pool: FewShotExample[],
  input: DraftInput,
  plays: Play[],
): FewShotSelection {
  if (pool.length === 0) {
    return { examples: [], reason: 'No win pool yet. Drafting without examples.' }
  }

  const currentPlay = pickPlayForSignal(plays, input.extracted.signalType)
  const leadTags = new Set(input.extracted.tags.map((t) => t.toLowerCase()))

  const scored = pool
    .map((ex) => {
      let score = 0
      if (currentPlay && ex.playId === currentPlay.id) score += 10
      if (ex.signalType === input.extracted.signalType) score += 8
      const overlap = ex.tags.filter((t) => leadTags.has(t.toLowerCase())).length
      score += overlap * 3
      return { ex, score }
    })
    .sort((a, b) => b.score - a.score)

  const picked = scored.slice(0, 2).map((s) => s.ex)

  const reason =
    picked.length === 0
      ? 'No close matches in the win pool.'
      : picked.length === 1
        ? `Matched 1 example from ${picked[0].company} (same ${currentPlay && picked[0].playId === currentPlay.id ? 'play' : picked[0].signalType === input.extracted.signalType ? 'signal' : 'tags'}).`
        : `Matched 2 examples: ${picked[0].company}${picked[1] ? ' and ' + picked[1].company : ''}.`

  return { examples: picked, reason }
}

/**
 * Build a prompt block that injects few-shot examples before the main user prompt.
 * The examples are shown as user/assistant turns so the model learns the shape
 * of winning messages for this team's market.
 */
export function buildFewShotBlock(
  examples: FewShotExample[],
): string {
  if (examples.length === 0) return ''

  const lines: string[] = ['Here are real messages that got a reply from a similar lead. Use them as a style reference, not a template to copy word for word.']

  for (const ex of examples) {
    lines.push('')
    lines.push(`Example (lead: ${ex.company}, signal: ${ex.signalEvidence || 'unknown'}):`)
    lines.push(ex.sentText)
  }

  lines.push('')
  lines.push('Now write a fresh message for the lead below. Do not copy the example verbatim.')

  return lines.join('\n')
}
