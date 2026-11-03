import type { DailyContentIdea } from '@/lib/domain/types'

/**
 * Content Ideas V3 — one read model over `daily_content_ideas`. Pure helpers
 * only; the page owns the query. Status is derived from canonical columns
 * (posted_at / copied_at / idea_type), never invented.
 */

export interface ContentIdeaRow {
  id: string
  personaId: string
  personaName: string
  ideaType: 'recommended' | 'alternate'
  title: string
  angle: string | null
  whyNow: string | null
  territory: string | null
  trendGrounded: boolean
  postCaption: string | null
  sourceFreshness: string | null
  formatSuggestion: string | null
  copiedAt: string | null
  postedAt: string | null
  createdAt: string
}

export type IdeaStatusFilter = 'all' | 'recommended' | 'alternate' | 'used' | 'posted'

export interface IdeaFilters {
  personaId: string | 'ALL'
  topic: string | 'ALL'
  source: 'ALL' | 'trend' | 'editorial'
  status: IdeaStatusFilter
}

/** Map a snake_case `daily_content_ideas` row to the read model. */
export function rowToContentIdea(row: Record<string, unknown>, personaName: string): ContentIdeaRow {
  return {
    id: row.id as string,
    personaId: row.persona_id as string,
    personaName,
    ideaType: row.idea_type === 'recommended' ? 'recommended' : 'alternate',
    title: row.title as string,
    angle: (row.angle as string | null) ?? null,
    whyNow: (row.why_now as string | null) ?? null,
    territory: (row.territory as string | null) ?? null,
    trendGrounded: Boolean(row.trend_grounded),
    postCaption: (row.post_caption as string | null) ?? null,
    sourceFreshness: (row.source_freshness as string | null) ?? null,
    formatSuggestion: (row.format_suggestion as string | null) ?? null,
    copiedAt: (row.copied_at as string | null) ?? null,
    postedAt: (row.posted_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

export function ideaStatus(idea: ContentIdeaRow): 'posted' | 'used' | 'recommended' | 'alternate' {
  if (idea.postedAt) return 'posted'
  if (idea.copiedAt) return 'used'
  return idea.ideaType
}

export function filterIdeaRows(rows: ContentIdeaRow[], filters: IdeaFilters): ContentIdeaRow[] {
  return rows.filter((row) => {
    if (filters.personaId !== 'ALL' && row.personaId !== filters.personaId) return false
    if (filters.topic !== 'ALL' && row.territory !== filters.topic) return false
    if (filters.source === 'trend' && !row.trendGrounded) return false
    if (filters.source === 'editorial' && row.trendGrounded) return false
    if (filters.status !== 'all' && ideaStatus(row) !== filters.status) return false
    return true
  })
}

export function ideaTopics(rows: ContentIdeaRow[]): string[] {
  return [...new Set(rows.map((r) => r.territory).filter((t): t is string => Boolean(t)))].sort()
}

/** URL-backed view membership: today's ideas, recent (7d), or all. */
export function ideaViewMatches(idea: ContentIdeaRow, view: 'today' | 'recent' | 'all', now: number): boolean {
  if (view === 'all') return true
  const created = Date.parse(idea.createdAt)
  if (Number.isNaN(created)) return view === 'recent'
  const days = view === 'today' ? 1 : 7
  return now - created <= days * 86_400_000
}

export function toUnifiedIdea(idea: DailyContentIdea): { id: string; title: string } {
  return { id: idea.id, title: idea.title }
}

/** The draft editor's initial values from an idea — caption and source material. */
export function draftSourceFromIdea(idea: {
  postCaption: string | null
  angle: string | null
  title: string
}): { caption: string; sourceMaterial: string } {
  return { caption: idea.postCaption ?? '', sourceMaterial: idea.angle ?? idea.title }
}
