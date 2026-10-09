
export interface PersonaAngleProfile {
  type: 'cto' | 'engineer' | 'founder' | 'devops' | 'designer' | 'sales' | 'pm' | 'leader'
  lenses: string[]
  priorities: string[]
  avoidAngles: string[]
}

export interface DiversifiedAngle {
  lens: string
  focus: string
  whyThisPersona: string
}

/**
 * Map a persona role to their angle profile.
 * This is deterministic — no AI needed to decide which lens to use.
 */
export function getPersonaAngleProfile(role: string, seniority?: string): PersonaAngleProfile {
  const roleLower = role.toLowerCase()

  if (/cto|chief|vp|head|director|executive/.test(roleLower)) {
    return {
      type: 'cto',
      lenses: ['organizational implication', 'team structure', 'strategic decision', 'hiring/training impact'],
      priorities: ['What does this mean for how we operate?', 'How should teams adapt?', 'Resource allocation'],
      avoidAngles: ['step-by-step tutorial', 'personal coding experience'],
    }
  }

  if (/founder|ceo|co-founder|president/.test(roleLower)) {
    return {
      type: 'founder',
      lenses: ['commercial implication', 'market timing', 'competitive positioning', 'funding/business impact'],
      priorities: ['Is this a market signal?', 'Should we pivot?', 'What do customers think?'],
      avoidAngles: ['deep technical implementation', 'infrastructure details'],
    }
  }

  if (/devops|sre|platform|infra|reliability|cloud/.test(roleLower)) {
    return {
      type: 'devops',
      lenses: ['deployment/operations implication', 'reliability impact', 'automation opportunity', 'cost/performance tradeoff'],
      priorities: ['How does this change our deploy process?', 'Is it stable enough?', 'What breaks?'],
      avoidAngles: ['business strategy', 'market analysis', 'funding implications'],
    }
  }

  if (/designer|ux|ui|product.design|creative/.test(roleLower)) {
    return {
      type: 'designer',
      lenses: ['user experience implication', 'interface/interaction impact', 'accessibility', 'design system effect'],
      priorities: ['How does this change the user experience?', 'What should designers know?', 'Interaction patterns'],
      avoidAngles: ['backend infrastructure', 'deployment pipelines', 'database optimization'],
    }
  }

  if (/sales|account|business.dev|revenue|growth/.test(roleLower)) {
    return {
      type: 'sales',
      lenses: ['customer conversation angle', 'objection handling', 'competitive positioning', 'deal velocity impact'],
      priorities: ['How do I explain this to customers?', 'Does this change our pitch?', 'Competitive advantage?'],
      avoidAngles: ['implementation details', 'code examples', 'infrastructure'],
    }
  }

  if (/product|pm|program.manager/.test(roleLower)) {
    return {
      type: 'pm',
      lenses: ['product strategy implication', 'user value', 'feature opportunity', 'roadmap timing'],
      priorities: ['Should we build this?', 'What do users need?', 'How does this affect our roadmap?'],
      avoidAngles: ['deep infrastructure', 'personal coding stories'],
    }
  }

  if (/leader|manager|lead|principal/.test(roleLower) || seniority === 'senior' || seniority === 'executive') {
    return {
      type: 'leader',
      lenses: ['team/organizational implication', 'decision framework', 'mentorship angle', 'industry direction'],
      priorities: ['What should my team know?', 'How does this affect our direction?', 'What would I tell a junior?'],
      avoidAngles: ['beginner tutorial', 'basic how-to'],
    }
  }

  // Default: engineer
  return {
    type: 'engineer',
    lenses: ['technical architecture implication', 'implementation approach', 'performance/scaling', 'developer experience'],
    priorities: ['How does this work under the hood?', 'Should we adopt it?', 'What are the tradeoffs?'],
    avoidAngles: ['business strategy', 'market analysis', 'executive summary'],
  }
}

/**
 * Generate a diversified angle for a persona viewing a trend through their lens.
 * Returns a focused angle description that the AI writer can use.
 */
export function generateDiversifiedAngle(
  personaType: PersonaAngleProfile,
  trendTitle: string,
  trendTopics: string[],
): DiversifiedAngle {
  const lensIndex = hashString(trendTitle) % personaType.lenses.length
  const lens = personaType.lenses[lensIndex]

  return {
    lens,
    focus: `View "${trendTitle}" through the lens of ${lens}. ${personaType.priorities[lensIndex % personaType.priorities.length]}`,
    whyThisPersona: `As a ${personaType.type}, your audience expects you to discuss ${lens}, not ${personaType.avoidAngles[0]}.`,
  }
}

/**
 * Build a diversification prompt block for the AI writer.
 * Tells the writer which angle to take based on persona type.
 */
export function buildDiversificationPromptBlock(
  angle: DiversifiedAngle,
): string {
  return `EDITORIAL ANGLE: ${angle.focus}
WHY THIS ANGLE: ${angle.whyThisPersona}
Do NOT write about this from a generic perspective. Write specifically from this persona's professional viewpoint.`
}


function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}
