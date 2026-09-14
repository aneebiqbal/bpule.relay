/**
 * One-tap opinion selection — replaces long interviews with choices.
 */

import type { ContentProfile } from '@/lib/domain/types'

export interface OpinionChoice { id: string; opinion: string; territory: string; explanation: string }
export interface OpinionSelectionSet { choices: OpinionChoice[]; context: string; multiSelect: boolean }

export function generateOpinionChoices(profile: ContentProfile | null, territory: string): OpinionSelectionSet {
  const choices = getChoicesForTerritory(profile, territory)
  return { choices, context: `What's closest to your view on ${territory.replace(/_/g, ' ')}?`, multiSelect: false }
}

export function getDirectionChoices(): Array<{ id: string; label: string; description: string }> {
  return [
    { id: 'technical', label: 'Technical', description: 'Focus on the mechanism and specifics' },
    { id: 'practical', label: 'Practical', description: 'Focus on actionable takeaways' },
    { id: 'sharp', label: 'Sharp', description: 'Bold, direct, contrarian' },
    { id: 'casual', label: 'Casual', description: 'Conversational, approachable' },
  ]
}

function getChoicesForTerritory(profile: ContentProfile | null, territory: string): OpinionChoice[] {
  const allContext = [...(profile?.expertise?.map(e => e.area) ?? []), ...(profile?.technologies?.map(t => t.name) ?? [])].join(' ').toLowerCase()

  switch (territory) {
    case 'engineering_culture':
      return [
        { id: 'k8s_early', opinion: 'Teams adopt Kubernetes too early', territory: 'engineering_culture', explanation: 'The operational cost often exceeds the benefit for small teams' },
        { id: 'k8s_late', opinion: 'Teams wait too long to adopt container orchestration', territory: 'engineering_culture', explanation: 'Manual deployment becomes a bottleneck as you scale' },
        { id: 'k8s_maturity', opinion: 'It depends on operational maturity, not team size', territory: 'engineering_culture', explanation: 'The decision should be driven by deployment complexity' },
        { id: 'no_opinion', opinion: 'No strong opinion on this', territory: 'engineering_culture', explanation: 'Skip this topic' },
      ]
    case 'ai':
      return [
        { id: 'ai_judgment', opinion: 'AI is making implementation cheaper, but engineering judgment is not', territory: 'ai', explanation: 'The bottleneck is shifting from writing code to deciding what to build' },
        { id: 'ai_replacement', opinion: 'AI will replace most junior development work within 5 years', territory: 'ai', explanation: 'Routine coding tasks are increasingly automated' },
        { id: 'ai_tool', opinion: 'AI is a better compiler, not a replacement for thinking', territory: 'ai', explanation: 'It speeds up execution but does not make architectural decisions' },
        { id: 'no_opinion', opinion: 'No strong opinion on this', territory: 'ai', explanation: 'Skip this topic' },
      ]
    case 'technology':
      if (allContext.includes('react') || allContext.includes('javascript') || allContext.includes('typescript')) {
        return [
          { id: 'framework_fatigue', opinion: 'Frontend framework fatigue is real, but the churn produces genuine progress', territory: 'technology', explanation: 'Most of what is "new" is rediscovery, but some advances stick' },
          { id: 'boring_tech', opinion: 'Boring technology choices are underrated', territory: 'technology', explanation: 'Newer is not always better for production systems' },
          { id: 'types_worth', opinion: 'TypeScript is worth the overhead for any non-trivial project', territory: 'technology', explanation: 'The safety net pays for itself in reduced debugging' },
          { id: 'no_opinion', opinion: 'No strong opinion on this', territory: 'technology', explanation: 'Skip this topic' },
        ]
      }
      if (allContext.includes('rails') || allContext.includes('ruby')) {
        return [
          { id: 'rails_scaling', opinion: 'Rails scales fine if you understand where it does not', territory: 'technology', explanation: 'Most scaling failures are architecture problems, not framework problems' },
          { id: 'monolith_first', opinion: 'Start with a monolith. Extract services when pain demands it.', territory: 'technology', explanation: 'Microservices are an organizational solution, not a technical one' },
          { id: 'no_opinion', opinion: 'No strong opinion on this', territory: 'technology', explanation: 'Skip this topic' },
        ]
      }
      return [
        { id: 'pragmatic', opinion: 'The right tool is the one your team can operate at 3am', territory: 'technology', explanation: 'Operational maturity beats technical elegance' },
        { id: 'no_opinion', opinion: 'No strong opinion on this', territory: 'technology', explanation: 'Skip this topic' },
      ]
    case 'work_habits':
      return [
        { id: 'deep_work', opinion: 'Most developers do not protect deep work hours aggressively enough', territory: 'work_habits', explanation: 'Context switching is the real productivity killer' },
        { id: 'meetings_necessary', opinion: 'Most meetings could be a well-written async message', territory: 'work_habits', explanation: 'Synchronous communication is overused in remote teams' },
        { id: 'no_opinion', opinion: 'No strong opinion on this', territory: 'work_habits', explanation: 'Skip this topic' },
      ]
    default:
      return [
        { id: 'strong_take', opinion: 'There is a conventional wisdom here that deserves to be challenged', territory, explanation: 'Offer a contrarian perspective' },
        { id: 'nuanced_take', opinion: 'The truth is more nuanced than most people acknowledge', territory, explanation: 'A balanced take that acknowledges complexity' },
        { id: 'no_opinion', opinion: 'No strong opinion on this', territory, explanation: 'Skip this topic' },
      ]
  }
}
