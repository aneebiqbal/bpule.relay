import type {
  ContentProfile,
  ContentOpportunityType,
  TopicCluster,
  ContentHistoryEntry,
  ContentMemory,
} from '@/lib/domain/types'

/**
 * Post Radar / Opportunity Discovery Engine.
 *
 * Proactively surfaces content opportunities for the individual by scanning:
 * - Content DNA (expertise, experiences, projects)
 * - Recent topic clusters (staleness)
 * - Content history (gaps)
 * - Content memory (what hasn't been covered)
 *
 * This is a deterministic engine — no model calls needed for the default path.
 * Model-based discovery can be layered on top later.
 */

export interface OpportunityCandidate {
  type: ContentOpportunityType
  title: string
  description: string
  trigger: string
  confidence: number
  sourceKind: 'user_input' | 'system_inferred' | 'history_pattern'
}

const OPPORTUNITY_TTL_DAYS = 14

/**
 * Scan the user's profile, clusters, history, and memory for content opportunities.
 */
export function discoverOpportunities(input: {
  profile: ContentProfile | null
  clusters: TopicCluster[]
  history: ContentHistoryEntry[]
  memories: ContentMemory[]
  recentUserInput?: string
}): OpportunityCandidate[] {
  const candidates: OpportunityCandidate[] = []
  const now = Date.now()

  // ── From Content DNA ──────────────────────────────────────────────────────

  if (input.profile) {
    // Projects with lessons
    for (const project of input.profile.projects) {
      if (project.lessons.length > 0) {
        candidates.push({
          type: 'behind_the_build',
          title: `Behind the build: ${project.name}`,
          description: `You worked on ${project.name}${project.description ? ` (${project.description})` : ''}. ${project.lessons[0] ? `The lesson: ${project.lessons[0]}` : 'There\'s a story in what you built and what you learned.'}`,
          trigger: `Project "${project.name}" in your Content DNA`,
          confidence: 0.8,
          sourceKind: 'system_inferred',
        })
      } else if (project.outcome) {
        candidates.push({
          type: 'recent_work',
          title: `What ${project.name} taught you`,
          description: `You delivered ${project.name} with outcome: ${project.outcome}. Others would benefit from your experience.`,
          trigger: `Project outcome recorded`,
          confidence: 0.7,
          sourceKind: 'system_inferred',
        })
      }
    }

    // Experiences / lessons
    for (const exp of input.profile.experiences) {
      if (exp.lesson.trim()) {
        const type = exp.type === 'mistake' ? 'mistake_or_failure'
          : exp.type === 'success' ? 'production_lesson'
          : exp.type === 'decision' ? 'technical_decision'
          : 'career_lesson'
        candidates.push({
          type,
          title: exp.type === 'mistake' ? `The mistake that taught you about ${exp.description.split(' ')[0]}`
            : exp.type === 'decision' ? `Why you decided to ${exp.description.split(' ').slice(0, 6).join(' ')}`
            : `Lesson: ${exp.lesson.slice(0, 50)}`,
          description: exp.lesson,
          trigger: `${exp.type} recorded in Content DNA`,
          confidence: 0.75,
          sourceKind: 'system_inferred',
        })
      }
    }

    // Opinions (strong or moderate — both are postable)
    for (const opinion of input.profile.opinions) {
      const confidence = opinion.strength === 'strong' ? 0.7 : 0.55
      candidates.push({
        type: 'contrarian_position',
        title: `Your take: "${opinion.belief.slice(0, 60)}${opinion.belief.length > 60 ? '...' : ''}"`,
        description: `You hold an opinion: "${opinion.belief}". This could spark a meaningful discussion.`,
        trigger: `${opinion.strength} conviction in Content DNA`,
        confidence,
        sourceKind: 'system_inferred',
      })
    }

    // Topics they care about (from Content DNA)
    for (const topic of input.profile.topicsCared ?? []) {
      candidates.push({
        type: 'useful_explanation',
        title: `Your perspective on ${topic.topic}`,
        description: `You listed "${topic.topic}" as a topic you care about. Share your unique take with your audience.`,
        trigger: `Topic of interest: ${topic.topic}`,
        confidence: 0.5,
        sourceKind: 'system_inferred',
      })
    }

    // Expertise gaps (things they know but haven't posted about)
    const coveredTopics = new Set(
      input.memories
        .filter((m) => m.memoryType === 'topic_covered')
        .map((m) => m.content.toLowerCase()),
    )
    for (const exp of input.profile.expertise) {
      const alreadyCovered = [...coveredTopics].some((t) => t.includes(exp.area.toLowerCase()))
      if (!alreadyCovered && (exp.level === 'expert' || exp.level === 'advanced')) {
        candidates.push({
          type: 'useful_explanation',
          title: `Teach something about ${exp.area}`,
          description: `You have ${exp.level} expertise in ${exp.area} but haven't posted about it. Your audience would benefit from your perspective.`,
          trigger: `Uncovered expertise: ${exp.area}`,
          confidence: 0.6,
          sourceKind: 'system_inferred',
        })
      }
    }
  }

  // ── From topic clusters (staleness) ────────────────────────────────────────

  for (const cluster of input.clusters) {
    if (!cluster.lastInputAt) {
      // Never posted about this cluster
      candidates.push({
        type: 'useful_explanation',
        title: `What's happening with ${cluster.clusterName}?`,
        description: cluster.description
          ? `You listed "${cluster.clusterName}" as a focus area: ${cluster.description}. When did you last share your perspective?`
          : `"${cluster.clusterName}" is one of your focus areas but you haven't posted about it yet.`,
        trigger: `Topic cluster never posted`,
        confidence: 0.5,
        sourceKind: 'system_inferred',
      })
      continue
    }

    const daysSince = (now - new Date(cluster.lastInputAt).getTime()) / 86_400_000
    if (daysSince >= 14) {
      candidates.push({
        type: 'industry_development',
        title: `Update your thoughts on ${cluster.clusterName}`,
        description: `It's been ${Math.floor(daysSince)} days since you posted about "${cluster.clusterName}". Fresh developments likely exist.`,
        trigger: `Topic cluster stale (${Math.floor(daysSince)} days)`,
        confidence: 0.55,
        sourceKind: 'history_pattern',
      })
    }
  }

  // ── From recent user input ─────────────────────────────────────────────────

  if (input.recentUserInput) {
    const lower = input.recentUserInput.toLowerCase()
    if (/\b(spent|debugged|built|shipped|fixed|worked on)\b/.test(lower)) {
      candidates.push({
        type: 'recent_work',
        title: 'You have a post hiding in what you worked on recently',
        description: input.recentUserInput.slice(0, 200),
        trigger: 'Recent user input mentions work activity',
        confidence: 0.85,
        sourceKind: 'user_input',
      })
    }
    if (/\b(learned|lesson|mistake|failed|wrong|realized|discovered)\b/.test(lower)) {
      candidates.push({
        type: 'production_lesson',
        title: 'A lesson from something that happened recently',
        description: input.recentUserInput.slice(0, 200),
        trigger: 'Recent user input mentions learning/mistake',
        confidence: 0.85,
        sourceKind: 'user_input',
      })
    }
    if (/\b(i think|i believe|in my opinion|hot take|unpopular)\b/.test(lower)) {
      candidates.push({
        type: 'contrarian_position',
        title: 'You have an opinion worth sharing',
        description: input.recentUserInput.slice(0, 200),
        trigger: 'Recent user input expresses opinion',
        confidence: 0.8,
        sourceKind: 'user_input',
      })
    }
  }

  // ── Evergreen fallback ────────────────────────────────────────────────────
  if (candidates.length === 0) {
    candidates.push({
      type: 'useful_explanation',
      title: 'What I wish I knew earlier in my career',
      description: 'Share a lesson that would have saved you time or frustration.',
      trigger: 'Evergreen: career lesson',
      confidence: 0.4,
      sourceKind: 'system_inferred',
    })
    candidates.push({
      type: 'useful_explanation',
      title: 'A common mistake and how to avoid it',
      description: 'Teach something practical that people can apply immediately.',
      trigger: 'Evergreen: practical lesson',
      confidence: 0.35,
      sourceKind: 'system_inferred',
    })
  }

  // ── Dedup and rank ─────────────────────────────────────────────────────────

  return dedupAndRankOpportunities(candidates)
}

function dedupAndRankOpportunities(candidates: OpportunityCandidate[]): OpportunityCandidate[] {
  // Remove duplicate types, keep highest confidence
  const byType = new Map<ContentOpportunityType, OpportunityCandidate>()
  for (const c of candidates) {
    const existing = byType.get(c.type)
    if (!existing || c.confidence > existing.confidence) {
      byType.set(c.type, c)
    }
  }

  return [...byType.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8)
}
