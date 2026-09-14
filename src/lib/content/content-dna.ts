import type {
  ContentProfile,
  ContentProfileExpertise,
  ContentProfileOpinion,
  ContentProfileExperience,
  ContentProfileProject,
  ContentProfileTopic,
} from '@/lib/domain/types'

/**
 * Content DNA service.
 *
 * Responsible for:
 * 1. Assembling a Content Profile into a prompt block for the generation pipeline.
 * 2. Extracting candidate profile updates from user interactions (progressive profiling).
 * 3. Calculating profile confidence.
 *
 * Design principle: the profile is built incrementally. Every interaction can
 * suggest updates, but nothing is treated as fact without sufficient evidence
 * or user confirmation.
 */

// ── Prompt assembly ──────────────────────────────────────────────────────────

export function buildContentDnaPromptBlock(profile: ContentProfile | null): string {
  if (!profile) return ''

  const sections: string[] = []

  if (profile.role || profile.seniority || profile.industries.length > 0) {
    const parts: string[] = []
    if (profile.role && profile.seniority) {
      parts.push(`${profile.seniority} ${profile.role}`)
    } else if (profile.role) {
      parts.push(profile.role)
    } else if (profile.seniority) {
      parts.push(profile.seniority)
    }
    if (profile.industries.length > 0) {
      parts.push(`in ${profile.industries.join(', ')}`)
    }
    sections.push(`This person is a ${parts.join(' ')}.`)
  }

  if (profile.audience) {
    sections.push(`Their target audience is ${profile.audience}.`)
  }

  if (profile.expertise.length > 0) {
    const top = profile.expertise
      .filter((e) => e.level === 'expert' || e.level === 'advanced')
      .slice(0, 5)
    if (top.length > 0) {
      sections.push(`Deep expertise: ${top.map((e) => e.area).join(', ')}.`)
    }
  }

  if (profile.technologies.length > 0) {
    const top = profile.technologies
      .filter((t) => t.proficiency === 'expert' || t.proficiency === 'proficient')
      .slice(0, 6)
    if (top.length > 0) {
      sections.push(`Technologies: ${top.map((t) => t.name).join(', ')}.`)
    }
  }

  if (profile.topicsCared.length > 0) {
    const passionate = profile.topicsCared
      .filter((t) => t.intensity === 'passionate')
      .slice(0, 4)
    if (passionate.length > 0) {
      sections.push(`Passionate about: ${passionate.map((t) => t.topic).join(', ')}.`)
    }
  }

  if (profile.topicsAvoided.length > 0) {
    sections.push(`Avoids: ${profile.topicsAvoided.map((t) => t.topic).join(', ')}.`)
  }

  if (profile.opinions.length > 0) {
    const strong = profile.opinions
      .filter((o) => o.strength === 'strong' || o.strength === 'moderate')
      .slice(0, 5)
    if (strong.length > 0) {
      sections.push(`Real convictions:\n${strong.map((o) => `- ${o.belief}`).join('\n')}`)
    }
  }

  if (profile.projects.length > 0) {
    const notable = profile.projects.slice(0, 3)
    sections.push(`Notable work:\n${notable.map((p) => `- ${p.name}: ${p.description}`).join('\n')}`)
  }

  if (profile.experiences.length > 0) {
    const lessons = profile.experiences
      .filter((e) => e.lesson.trim().length > 0)
      .slice(0, 3)
    if (lessons.length > 0) {
      sections.push(`Lessons learned:\n${lessons.map((e) => `- ${e.lesson}`).join('\n')}`)
    }
  }

  const wc = profile.writingCharacteristics
  if (wc.sentenceRhythm || wc.preferredLength || wc.questionFrequency || wc.dataUsage) {
    const traits: string[] = []
    if (wc.sentenceRhythm) traits.push(wc.sentenceRhythm)
    if (wc.preferredLength) traits.push(`prefers ${wc.preferredLength} posts`)
    if (wc.questionFrequency) traits.push(`${wc.questionFrequency} use of questions`)
    if (wc.dataUsage) traits.push(`${wc.dataUsage} data usage`)
    if (traits.length > 0) {
      sections.push(`Writing traits: ${traits.join(', ')}.`)
    }
  }

  if (sections.length === 0) return ''

  return `ABOUT THIS PERSON (use to make this post sound like only they could have written it):\n${sections.join('\n')}`
}

// ── Confidence calculation ───────────────────────────────────────────────────

export function calculateProfileConfidence(profile: ContentProfile): number {
  let score = 0
  const maxScore = 10

  if (profile.role.trim()) score += 1
  if (profile.seniority.trim()) score += 0.5
  if (profile.industries.length > 0) score += 0.5
  if (profile.audience.trim()) score += 0.5
  if (profile.expertise.length >= 3) score += 1
  else if (profile.expertise.length > 0) score += 0.5
  if (profile.technologies.length >= 3) score += 0.5
  else if (profile.technologies.length > 0) score += 0.25
  if (profile.opinions.length >= 2) score += 1
  else if (profile.opinions.length > 0) score += 0.5
  if (profile.projects.length > 0) score += 1
  if (profile.experiences.length > 0) score += 1
  if (profile.topicsCared.length >= 2) score += 0.5
  if (Object.keys(profile.writingCharacteristics).length > 0) score += 0.5
  if (profile.goals.length > 0) score += 0.5
  if (profile.storytellingTendencies.length > 0) score += 0.5

  return Math.min(score / maxScore, 1)
}

// ── Progressive profiling ────────────────────────────────────────────────────

export interface DnaUpdateCandidate {
  type: 'expertise' | 'opinion' | 'experience' | 'project' | 'topic'
  value: ContentProfileExpertise | ContentProfileOpinion | ContentProfileExperience | ContentProfileProject | ContentProfileTopic
  confidence: number  // 0-1, how confident are we in this extraction
  source: string      // the user input that triggered this
}

/**
 * Extract candidate profile updates from a user's answer/input.
 *
 * This is a lightweight extraction — it identifies things that LOOK like they
 * should be in the profile. The caller decides whether to apply based on
 * confidence threshold or user confirmation.
 */
export function extractDnaCandidatesFromAnswer(
  answer: string,
  existing: ContentProfile | null,
): DnaUpdateCandidate[] {
  const candidates: DnaUpdateCandidate[] = []
  const lower = answer.toLowerCase()
  const now = new Date().toISOString()

  // Look for experience/lesson patterns
  const experiencePatterns = [
    { regex: /\b(i|we)\s+(spent|debugged|built|shipped|fixed|ship|built|created|led|launched|migrated|refactored)\b/i, type: 'experience' as const },
    { regex: /\b(turns out|i learned|the lesson|what i realized|i discovered|found out|was reading|instead of|by adding)\b/i, type: 'lesson' as const },
    { regex: /\b(failed|mistake|wrong|broke|regret|wish i had)\b/i, type: 'mistake' as const },
    { regex: /\b(decided to|chose to|went with|picked|opted for)\b/i, type: 'decision' as const },
    { regex: /\b(the\s+\w+\s+(was|were|is|are)\s+\w+ing)\b/i, type: 'experience' as const },
  ]

  for (const pattern of experiencePatterns) {
    if (pattern.regex.test(answer)) {
      const existingLessons = existing?.experiences.map((e) => e.description) ?? []
      if (!existingLessons.some((l) => similarity(l, answer) > 0.6)) {
        candidates.push({
          type: 'experience',
          value: {
            type: pattern.type === 'mistake' ? 'mistake'
              : pattern.type === 'lesson' ? 'lesson'
              : pattern.type === 'decision' ? 'decision'
              : 'project',
            description: answer.trim(),
            lesson: '',
            date: null,
            updatedAt: now,
          },
          confidence: 0.6,
          source: answer.trim().slice(0, 100),
        })
      }
    }
  }

  // Look for opinion patterns
  const opinionPatterns = [
    /\bi think\b/i,
    /\bi believe\b/i,
    /\bin my opinion\b/i,
    /\bthe thing is\b/i,
    /\bunpopular opinion\b/i,
    /\bhot take\b/i,
    /\bcontroversial take\b/i,
    /\bstrongly believe\b/i,
    /\bmost (startups?|teams?|companies?|engineers?)\s+\w+\s+\w+\s+(way too|too|should|shouldn't|need to)\b/i,
    /\bmost (startups?|teams?|companies?|engineers?)\s+(introduce|adopt|use|need|should|shouldn't)\b/i,
    /\boverrated\b/i,
    /\bunderrated\b/i,
    /\b(should|shouldn't|need to|must|never|always)\s+\w+\s+(it|them|this|that|earlier|sooner|later|immediately)\b/i,
  ]

  for (const regex of opinionPatterns) {
    if (regex.test(answer)) {
      const existingBeliefs = existing?.opinions.map((o) => o.belief) ?? []
      if (!existingBeliefs.some((b) => similarity(b, answer) > 0.6)) {
        candidates.push({
          type: 'opinion',
          value: {
            belief: answer.trim(),
            strength: 'moderate',
            evidence: '',
            source: 'answer',
            updatedAt: now,
          },
          confidence: 0.5,
          source: answer.trim().slice(0, 100),
        })
      }
    }
  }

  return candidates
}

function similarity(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\s+/))
  const bWords = new Set(b.toLowerCase().split(/\s+/))
  let intersection = 0
  for (const word of aWords) {
    if (bWords.has(word)) intersection++
  }
  const union = aWords.size + bWords.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ── DNA merging ──────────────────────────────────────────────────────────────

/**
 * Merge extracted candidates into an existing profile.
 *
 * Only applies candidates above a confidence threshold.
 * Deduplicates against existing entries.
 * Returns the patches to apply (does not mutate input).
 */
export function mergeDnaCandidates(
  existing: ContentProfile,
  candidates: DnaUpdateCandidate[],
  threshold = 0.5,
): {
  experiences: ContentProfileExperience[]
  opinions: ContentProfileOpinion[]
  expertise: ContentProfileExpertise[]
  topicsCared: ContentProfileTopic[]
} {
  const now = new Date().toISOString()
  const patches = {
    experiences: [] as ContentProfileExperience[],
    opinions: [] as ContentProfileOpinion[],
    expertise: [] as ContentProfileExpertise[],
    topicsCared: [] as ContentProfileTopic[],
  }

  for (const candidate of candidates) {
    if (candidate.confidence < threshold) continue

    switch (candidate.type) {
      case 'experience': {
        const exp = candidate.value as ContentProfileExperience
        const isDup = existing.experiences.some((e) => similarity(e.description, exp.description) > 0.6)
        if (!isDup) {
          patches.experiences.push({ ...exp, updatedAt: now })
        }
        break
      }
      case 'opinion': {
        const op = candidate.value as ContentProfileOpinion
        const isDup = existing.opinions.some((o) => similarity(o.belief, op.belief) > 0.6)
        if (!isDup) {
          patches.opinions.push({ ...op, updatedAt: now })
        }
        break
      }
      case 'expertise': {
        const ex = candidate.value as ContentProfileExpertise
        const isDup = existing.expertise.some((e) => e.area.toLowerCase() === ex.area.toLowerCase())
        if (!isDup) {
          patches.expertise.push({ ...ex, updatedAt: now })
        }
        break
      }
      case 'topic': {
        const topic = candidate.value as ContentProfileTopic
        const isDup = existing.topicsCared.some((t) => t.topic.toLowerCase() === topic.topic.toLowerCase())
        if (!isDup) {
          patches.topicsCared.push(topic)
        }
        break
      }
    }
  }

  return patches
}

// ── Initial profile from persona creation ────────────────────────────────────

export function buildInitialDnaFromPersona(params: {
  profileSummary?: string
  humorStyle?: string
  admiredExamples?: string[]
  valuesAndOpinions?: string[]
  topics?: Array<{ name: string; description: string }>
}): Pick<ContentProfile, 'opinions' | 'topicsCared' | 'writingCharacteristics'> {
  const now = new Date().toISOString()
  const result: Pick<ContentProfile, 'opinions' | 'topicsCared' | 'writingCharacteristics'> = {
    opinions: [],
    topicsCared: [],
    writingCharacteristics: {},
  }

  if (params.valuesAndOpinions && params.valuesAndOpinions.length > 0) {
    result.opinions = params.valuesAndOpinions.map((v) => ({
      belief: v,
      strength: 'moderate' as const,
      evidence: '',
      source: 'onboarding' as const,
      updatedAt: now,
    }))
  }

  if (params.topics && params.topics.length > 0) {
    result.topicsCared = params.topics.slice(0, 6).map((t) => ({
      topic: t.name,
      intensity: 'interested' as const,
      source: 'onboarding' as const,
    }))
  }

  if (params.humorStyle) {
    result.writingCharacteristics.sentenceRhythm = params.humorStyle.toLowerCase().includes('dry') || params.humorStyle.toLowerCase().includes('deadpan')
      ? 'measured, understated'
      : params.humorStyle.toLowerCase().includes('playful')
        ? 'varied, energetic'
        : 'natural'
  }

  return result
}
