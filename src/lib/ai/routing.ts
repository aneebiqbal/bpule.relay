import { cheapModel, extractModel, strongModel } from '@/lib/ai/config'

export type AiTask =
  /** One-time style-card calibration from quiz answers and pasted samples. */
  | 'calibrate'
  /** Raw research paste -> structured fields. */
  | 'extract'
  /** Reply-type routing (scaffolded, not implemented). */
  | 'classify'
  /** Outreach message drafting. */
  | 'draft'
  /** Best-of-two variant drafting (cheap model, parallel calls). */
  | 'draft-variant'

export interface ModelChoice {
  model: string
  tier: 'cheap' | 'strong'
  reason: string
}

/**
 * The single model-routing decision for the whole app, by task.
 *
 * Structuring work (calibration, extraction, classification) runs on the
 * cheapest capable model; every drafting task runs on the strong model so a
 * draft is right the first time and the self-check lives in the same call.
 *
 * Keep every route through this function; never hand-pick a model id in
 * feature code. Models are resolved from config.ts, so a provider or tier
 * change is a one-line edit.
 */
export function pickModel(task: AiTask): ModelChoice {
  switch (task) {
    case 'calibrate':
    case 'classify':
      return {
        model: cheapModel(),
        tier: 'cheap',
        reason: `${task} is a structuring task; the cheap model is capable and the call is not on the per-lead hot path.`,
      }
    case 'extract':
      return {
        model: extractModel(),
        tier: 'cheap',
        reason: 'Extraction runs on the cheapest Groq tier optimized for high-volume profile parsing.',
      }
    case 'draft':
      return {
        model: strongModel(),
        tier: 'strong',
        reason: 'Drafting is quality-critical and runs the self-check in the same call; always spend the strong model here.',
      }
    case 'draft-variant':
      return {
        model: cheapModel(),
        tier: 'cheap',
        reason: 'Best-of-two variant generation runs twice in parallel on the cheap model to keep cost low while improving selection.',
      }
  }
}
