import type { ContentPlatform } from '@/lib/domain/types'

interface HashtagSource {
  title?: string
  territory?: string
  angle?: string
}

/**
 * Generate a small set of relevant LinkedIn hashtags from post content.
 * Extracts topic keywords and normalizes them to PascalCase tags.
 * Returns up to 3 tags — never generic spam like #Success #Business.
 */
export function generateHashtags(postCaption: string, idea: HashtagSource, personaRole: string): string[] {
  const source = `${idea.title ?? ''} ${idea.territory ?? ''} ${idea.angle ?? ''} ${personaRole} ${postCaption}`.toLowerCase()
  const candidates: Array<{ tag: string; score: number }> = []

  const topicPatterns: Array<{ pattern: RegExp; tag: string }> = [
    { pattern: /\b(devops|sre|site reliability)\b/i, tag: 'DevOps' },
    { pattern: /\b(platform engineering|platform team)\b/i, tag: 'PlatformEngineering' },
    { pattern: /\b(kubernetes|k8s)\b/i, tag: 'Kubernetes' },
    { pattern: /\b(infrastructure|infra)\b/i, tag: 'Infrastructure' },
    { pattern: /\b(microservices|monolith)\b/i, tag: 'Microservices' },
    { pattern: /\b(software engineering|software development)\b/i, tag: 'SoftwareEngineering' },
    { pattern: /\b(leadership|management|cto|vp engineering)\b/i, tag: 'EngineeringLeadership' },
    { pattern: /\b(startup|founder|entrepreneur)\b/i, tag: 'Startup' },
    { pattern: /\b(machine learning|ml|ai|artificial intelligence)\b/i, tag: 'MachineLearning' },
    { pattern: /\b(data|analytics|metrics)\b/i, tag: 'DataEngineering' },
    { pattern: /\b(security|infosec|cybersecurity)\b/i, tag: 'Cybersecurity' },
    { pattern: /\b(cloud|aws|azure|gcp)\b/i, tag: 'CloudComputing' },
    { pattern: /\b(api|rest|graphql)\b/i, tag: 'API' },
    { pattern: /\b(remote work|distributed team|remote)\b/i, tag: 'RemoteWork' },
    { pattern: /\b(hiring|recruiting|talent)\b/i, tag: 'Hiring' },
    { pattern: /\b(open source|oss|github)\b/i, tag: 'OpenSource' },
    { pattern: /\b(agile|scrum|kanban)\b/i, tag: 'Agile' },
    { pattern: /\b(performance|optimization|latency)\b/i, tag: 'Performance' },
    { pattern: /\b(observability|monitoring|logging)\b/i, tag: 'Observability' },
    { pattern: /\b(ci\/cd|continuous integration|continuous delivery|deployment)\b/i, tag: 'CICD' },
  ]

  for (const { pattern, tag } of topicPatterns) {
    if (pattern.test(source)) {
      candidates.push({ tag, score: 1 })
    }
  }

  const seen = new Set<string>()
  // Skip tags already present in the caption to avoid duplicates like
  // "#Kubernetes ... #Kubernetes".
  for (const existingTag of postCaption.match(/#([A-Za-z][A-Za-z0-9]+)/g) ?? []) {
    seen.add(existingTag.slice(1))
  }
  const tags = candidates
    .filter(c => !seen.has(c.tag) && seen.add(c.tag))
    .slice(0, 3)
    .map(c => c.tag)

  if (tags.length === 0) {
    const words = postCaption.split(/\s+/).filter(w => w.length > 4)
    const seenWords = new Set<string>()
    for (const word of words) {
      const clean = word.replace(/[^a-zA-Z]/g, '')
      if (clean.length > 4 && !seenWords.has(clean.toLowerCase())) {
        seenWords.add(clean.toLowerCase())
        tags.push(clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase())
      }
      if (tags.length >= 3) break
    }
  }

  return tags.slice(0, 3)
}

/**
 * Append hashtags beneath a caption for platforms that support them.
 * LinkedIn: append up to 3 tags on a new line. X: no hashtags (caller should
 * strip any the model produced). Deterministic — safe to run after quality gates.
 */
export function appendHashtags(caption: string, idea: HashtagSource, personaRole: string, platform: ContentPlatform): string {
  if (platform !== 'linkedin') return caption
  const trimmed = caption.trimEnd()
  const tags = generateHashtags(trimmed, idea, personaRole)
  if (tags.length === 0) return trimmed
  return trimmed + '\n\n' + tags.map(t => `#${t}`).join(' ')
}
