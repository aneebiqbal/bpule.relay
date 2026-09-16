export type ArchiveEntityType =
  | 'lead'
  | 'proof'
  | 'upwork'
  | 'conversation'
  | 'identity'
  | 'studio'

export type ArchiveEntityFilter = ArchiveEntityType | 'all'

export interface ArchiveSearchCandidate {
  entityType: ArchiveEntityType
  id: string
  title: string
  subtitle: string
  status: string | null
  createdAt: string
  href?: string | null
  body?: string | null
  searchText?: string[]
  rankHint?: number
}

export interface RankedArchiveResult {
  entityType: ArchiveEntityType
  id: string
  title: string
  subtitle: string
  status: string | null
  createdAt: string
  href?: string
  rank: number
}

interface RankOptions {
  query: string
  entityFilter?: ArchiveEntityFilter
  statusFilter?: string[]
  limit?: number
}

const SPACE_RE = /\s+/g

function normalize(value: string | null | undefined): string {
  if (!value) return ''
  return value.toLowerCase().replace(SPACE_RE, ' ').trim()
}

function containsAtWordBoundary(value: string, query: string): boolean {
  const idx = value.indexOf(query)
  if (idx < 0) return false
  if (idx === 0) return true
  const prev = value[idx - 1]
  return prev === ' ' || prev === '-' || prev === '_' || prev === '/' || prev === '(' || prev === '['
}

function scoreCandidate(candidate: ArchiveSearchCandidate, query: string): number | null {
  const q = normalize(query)
  if (!q) return null

  const title = normalize(candidate.title)
  const subtitle = normalize(candidate.subtitle)
  const status = normalize(candidate.status)
  const body = normalize(candidate.body)
  const extra = (candidate.searchText ?? []).map((item) => normalize(item)).filter(Boolean)
  const tokens = q.split(' ').filter(Boolean)
  const corpus = [title, subtitle, status, body, ...extra].filter(Boolean).join(' ')

  const phraseHit = [title, subtitle, status, body, ...extra].some((field) => field.includes(q))
  const tokenHit = tokens.length > 0 && tokens.every((token) => corpus.includes(token))
  if (!phraseHit && !tokenHit) return null

  let score = Math.max(0, candidate.rankHint ?? 0)

  if (title === q) score += 1200
  else if (title.startsWith(q)) score += 940
  else if (containsAtWordBoundary(title, q)) score += 760
  else if (title.includes(q)) score += 580

  if (subtitle === q) score += 520
  else if (subtitle.startsWith(q)) score += 360
  else if (containsAtWordBoundary(subtitle, q)) score += 280
  else if (subtitle.includes(q)) score += 220

  if (status && status === q) score += 300
  else if (status && status.includes(q)) score += 140

  if (body.includes(q)) score += 140
  for (const field of extra) {
    if (field.includes(q)) score += 80
  }

  for (const token of tokens) {
    if (title.includes(token)) {
      score += 90
      continue
    }
    if (subtitle.includes(token)) {
      score += 55
      continue
    }
    if (status.includes(token)) {
      score += 45
      continue
    }
    if (body.includes(token)) {
      score += 20
      continue
    }
    if (extra.some((field) => field.includes(token))) {
      score += 14
    }
  }

  if (tokenHit) score += 25 * tokens.length
  return score
}

export function rankArchiveResults(
  candidates: ArchiveSearchCandidate[],
  opts: RankOptions,
): RankedArchiveResult[] {
  const entityFilter = opts.entityFilter ?? 'all'
  const statusFilter = new Set(
    (opts.statusFilter ?? []).map((status) => normalize(status)).filter(Boolean),
  )

  const deduped = new Map<string, RankedArchiveResult>()
  for (const candidate of candidates) {
    if (entityFilter !== 'all' && candidate.entityType !== entityFilter) continue

    const normalizedStatus = normalize(candidate.status)
    if (statusFilter.size > 0) {
      if (!normalizedStatus || !statusFilter.has(normalizedStatus)) continue
    }

    const rank = scoreCandidate(candidate, opts.query)
    if (rank === null) continue

    const key = `${candidate.entityType}:${candidate.id}`
    const next: RankedArchiveResult = {
      entityType: candidate.entityType,
      id: candidate.id,
      title: candidate.title,
      subtitle: candidate.subtitle,
      status: candidate.status,
      createdAt: candidate.createdAt,
      href: candidate.href ?? undefined,
      rank,
    }
    const existing = deduped.get(key)
    if (!existing || existing.rank < next.rank) {
      deduped.set(key, next)
    }
  }

  const sorted = [...deduped.values()].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank
    return b.createdAt.localeCompare(a.createdAt)
  })

  return sorted.slice(0, Math.max(1, opts.limit ?? 20))
}
