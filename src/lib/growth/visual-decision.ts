import type { PostPlan, RelayContentOpportunity } from '@/lib/domain/types'

export type VisualType =
  | 'TEXT_ONLY'
  | 'IMAGE'
  | 'CAROUSEL'
  | 'SCREENSHOT_STORY'
  | 'SHORT_VIDEO_SCRIPT'

export interface VisualDecision {
  type: VisualType
  reason: string
  imagePrompt?: string
}

export function decideVisual(plan: PostPlan, opp: RelayContentOpportunity): VisualDecision {
  if (plan.contentJob === 'build_in_public') {
    return {
      type: 'TEXT_ONLY',
      reason: 'Build-in-public posts perform better as text. The authenticity comes from the story, not visuals.',
    }
  }

  if (plan.contentJob === 'prove' || plan.contentJob === 'show') {
    return {
      type: 'SCREENSHOT_STORY',
      reason: 'Evidence-based posts benefit from showing the actual product or result.',
      imagePrompt: `Clean screenshot of Relay's ${plan.territory.replace(/_/g, ' ')} interface showing the key feature discussed in the post. Minimal, professional, no clutter.`,
    }
  }

  if (plan.contentJob === 'teach' && plan.territory === 'revenue_systems') {
    return {
      type: 'CAROUSEL',
      reason: 'Teaching content about revenue systems works well as a carousel — each slide can present one concept.',
      imagePrompt: `Carousel slide 1: Title card with "${plan.coreInsight}" on a clean background. Professional, minimal design.`,
    }
  }

  if (plan.contentJob === 'challenge' || plan.contentJob === 'start_conversation') {
    return {
      type: 'TEXT_ONLY',
      reason: 'Opinion and conversation-starting posts perform better as pure text. The argument is the content.',
    }
  }

  if (plan.contentJob === 'explain_product') {
    return {
      type: 'IMAGE',
      reason: 'Product explanation benefits from a clean visual showing the product in context.',
      imagePrompt: `Clean product screenshot of Relay's ${plan.territory.replace(/_/g, ' ')} feature. Professional, minimal UI.`,
    }
  }

  if (plan.contentJob === 'convert') {
    return {
      type: 'IMAGE',
      reason: 'Conversion posts benefit from a visual that shows the product or result.',
      imagePrompt: `Relay product screenshot showing the key value proposition. Clean, professional.`,
    }
  }

  return {
    type: 'TEXT_ONLY',
    reason: 'Default to text-only. Visuals should enhance, not replace, the written content.',
  }
}
