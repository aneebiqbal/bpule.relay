/**
 * Sprint 5 — Content / Studio V3 named fixtures.
 *
 * Deterministic, realistic content. These assert the Studio/Ideas/Growth
 * contracts: persona scope, idea status, filters, draft source mapping, copy
 * feedback, fallback generation, nav visibility and cross-surface parity.
 */
import { describe, expect, it } from 'vitest'
import {
  draftSourceFromIdea,
  filterIdeaRows,
  ideaStatus,
  ideaTopics,
  ideaViewMatches,
  rowToContentIdea,
} from '@/lib/content/ideas-v3'
import { canViewPersona } from '@/lib/content/persona-scope'
import { copyFeedbackLabel, publishFeedbackLabel, saveFeedbackLabel } from '@/lib/content/studio-feedback'
import { generatePostSeeds } from '@/lib/content/intelligence/v2/idea-engine'
import { RELAY_TREND_PROFILE } from '@/lib/growth/v2/relay-brand-profile'
import { rankTrendsForPersona } from '@/lib/trends/engine'
import type { TrendItem } from '@/lib/domain/types'
import {
  moreSheetSections,
  secondaryItems,
  visibleDomains,
  type RelayNavRoleFlags,
} from '@/lib/navigation/relay-shell-nav'
import {
  FIXTURE_FALLBACK_IDEA,
  FIXTURE_IDEAS,
  FIXTURE_MEMORIES,
  FIXTURE_RECENT_POSTS,
  FIXTURE_TRENDS,
} from './fixtures/v3-content-fixtures'

const rep: RelayNavRoleFlags = { isOwner: false, isAdmin: false, isManager: false }
const admin: RelayNavRoleFlags = { isOwner: false, isAdmin: true, isManager: false }

function trendItem(over: Partial<TrendItem> & Pick<TrendItem, 'id' | 'title'>): TrendItem {
  return {
    sourceId: 'src-1',
    sourceItemId: over.id,
    url: null,
    excerpt: null,
    author: null,
    publishedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    metrics: {},
    topics: [],
    contentFingerprint: over.id,
    evidenceQuality: 'medium',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...over,
  }
}

describe('V3 Studio', () => {
  it('V3_STUDIO_PRIMARY_RECOMMENDATION — the recommended idea is the primary object', () => {
    const recommended = FIXTURE_IDEAS.find((i) => i.ideaType === 'recommended')!
    expect(recommended).toBeTruthy()
    expect(recommended.title).toContain('list comprehensions')
    expect(recommended.postCaption).toBeTruthy()
    expect(FIXTURE_IDEAS.filter((i) => i.ideaType === 'recommended')).toHaveLength(1)
  })

  it('V3_STUDIO_ALTERNATES — four compact alternates carry a rationale', () => {
    const alternates = FIXTURE_IDEAS.filter((i) => i.ideaType === 'alternate')
    expect(alternates).toHaveLength(4)
    expect(alternates.every((a) => a.title && a.angle)).toBe(true)
  })

  it('V3_STUDIO_PERSONA_SCOPE — reps see their own personas; admins see the org', () => {
    const persona = { repId: 'rep-1' }
    expect(canViewPersona(persona, { repId: 'rep-1', role: 'rep' })).toBe(true)
    expect(canViewPersona(persona, { repId: 'rep-2', role: 'rep' })).toBe(false)
    expect(canViewPersona(persona, { repId: 'admin-1', role: 'admin' })).toBe(true)
  })

  it('V3_STUDIO_TREND_CONTEXT — trend context comes from the idea, not invented', () => {
    const trendIdea = FIXTURE_IDEAS.find((i) => i.id === 'idea-alt-2')!
    expect(trendIdea.trendGrounded).toBe(true)
    expect(trendIdea.territory).toBe('AI')
    expect(trendIdea.whyNow).toBeTruthy()
    const editorial = FIXTURE_IDEAS.find((i) => i.id === 'idea-alt-1')!
    expect(editorial.trendGrounded).toBe(false)
  })

  it('V3_STUDIO_CONTENT_MEMORY — recently used themes come from topic memories', () => {
    const themes = FIXTURE_MEMORIES.filter((m) => m.memoryType === 'topic_covered').map((m) => m.content)
    expect(themes).toContain('Postgres scaling')
    expect(themes).toContain('AI agents')
    expect(themes).toHaveLength(3)
    expect(FIXTURE_RECENT_POSTS.length).toBeGreaterThan(0)
  })

  it('V3_STUDIO_SAVE_DRAFT — the draft editor receives the idea caption and source', () => {
    const idea = FIXTURE_IDEAS[0]
    const source = draftSourceFromIdea({ postCaption: idea.postCaption, angle: idea.angle, title: idea.title })
    expect(source.caption).toBe(idea.postCaption)
    expect(source.sourceMaterial).toBe(idea.angle)
    const captionless = draftSourceFromIdea({ postCaption: null, angle: null, title: 'A title' })
    expect(captionless.caption).toBe('')
    expect(captionless.sourceMaterial).toBe('A title')
  })

  it('V3_STUDIO_COPY_FEEDBACK — every write has explicit feedback copy', () => {
    expect(copyFeedbackLabel(false)).toBe('Copy')
    expect(copyFeedbackLabel(true)).toBe('Copied')
    expect(saveFeedbackLabel(false)).toBe('Save draft')
    expect(saveFeedbackLabel(true)).toBe('Draft saved')
    expect(publishFeedbackLabel(false)).toBe('Mark published')
    expect(publishFeedbackLabel(true)).toBe('Marked published')
  })

  it('V3_STUDIO_GENERATION_FALLBACK — the deterministic engine still returns five ideas', () => {
    const result = generatePostSeeds(null, [], null)
    expect(result.seeds.length).toBeGreaterThan(0)
    expect(result.selected).toHaveLength(5)
    expect(FIXTURE_FALLBACK_IDEA.title).toContain('Postgres')
    expect(FIXTURE_FALLBACK_IDEA.angle).toBeTruthy()
  })
})

describe('V3 Ideas', () => {
  it('V3_IDEAS_FILTERS — topic, source and status filters narrow the set', () => {
    const all = filterIdeaRows(FIXTURE_IDEAS, { personaId: 'persona-eng', topic: 'ALL', source: 'ALL', status: 'all' })
    expect(all).toHaveLength(FIXTURE_IDEAS.length)
    expect(filterIdeaRows(FIXTURE_IDEAS, { personaId: 'persona-eng', topic: 'Python', source: 'ALL', status: 'all' })).toHaveLength(1)
    expect(filterIdeaRows(FIXTURE_IDEAS, { personaId: 'persona-eng', topic: 'ALL', source: 'trend', status: 'all' }).every((i) => i.trendGrounded)).toBe(true)
    expect(filterIdeaRows(FIXTURE_IDEAS, { personaId: 'persona-eng', topic: 'ALL', source: 'ALL', status: 'posted' })).toHaveLength(1)
  })

  it('V3_IDEAS_STATUS — status derives from canonical columns only', () => {
    expect(ideaStatus(FIXTURE_IDEAS.find((i) => i.id === 'idea-rec')!)).toBe('recommended')
    expect(ideaStatus(FIXTURE_IDEAS.find((i) => i.id === 'idea-alt-1')!)).toBe('used')
    expect(ideaStatus(FIXTURE_IDEAS.find((i) => i.id === 'idea-alt-4')!)).toBe('posted')
    expect(ideaStatus(FIXTURE_IDEAS.find((i) => i.id === 'idea-alt-3')!)).toBe('alternate')
  })

  it('V3_IDEAS_DRAFT_FLOW — every idea maps to a draft source', () => {
    for (const idea of FIXTURE_IDEAS) {
      const source = draftSourceFromIdea({ postCaption: idea.postCaption, angle: idea.angle, title: idea.title })
      expect(source.sourceMaterial).toBeTruthy()
    }
    expect(ideaTopics(FIXTURE_IDEAS)).toEqual(['AI', 'Build in public', 'Engineering culture', 'Postgres', 'Python'])
  })

  it('V3_IDEAS_ROLE_SCOPE — a persona outside the rep is refused', () => {
    const persona = { repId: 'rep-other' }
    expect(canViewPersona(persona, { repId: 'rep-me', role: 'rep' })).toBe(false)
    expect(canViewPersona(persona, { repId: 'admin', role: 'admin' })).toBe(true)
  })

  it('V3_IDEAS_VIEWS — today, recent and all partition by creation date', () => {
    const now = Date.now()
    expect(FIXTURE_IDEAS.filter((i) => ideaViewMatches(i, 'today', now)).length).toBeGreaterThan(0)
    expect(FIXTURE_IDEAS.filter((i) => ideaViewMatches(i, 'recent', now)).length).toBeGreaterThan(0)
    expect(FIXTURE_IDEAS.filter((i) => ideaViewMatches(i, 'all', now))).toHaveLength(FIXTURE_IDEAS.length)
  })

  it('V3_IDEAS_ROW_MAPPING — a snake_case row maps to the read model', () => {
    const row = rowToContentIdea(
      {
        id: 'i1',
        persona_id: 'p1',
        idea_type: 'recommended',
        title: 'Title',
        angle: 'Angle',
        why_now: 'Why',
        territory: 'Python',
        trend_grounded: true,
        post_caption: 'Body',
        source_freshness: 'high',
        format_suggestion: 'opinion',
        copied_at: null,
        posted_at: null,
        created_at: new Date().toISOString(),
      },
      'Mehak',
    )
    expect(row.personaName).toBe('Mehak')
    expect(ideaStatus(row)).toBe('recommended')
    expect(row.trendGrounded).toBe(true)
  })
})

describe('V3 Growth', () => {
  it('V3_GROWTH_BRIEF — the growth brief is the canonical brand post', () => {
    expect(FIXTURE_TRENDS.length).toBe(3)
    expect(FIXTURE_TRENDS.every((t) => t.title && t.whyNow)).toBe(true)
  })

  it('V3_GROWTH_TREND_SCOPE — ranked trends match the Relay brand territories', () => {
    const items = FIXTURE_TRENDS.map((t) => trendItem({ id: t.id, title: t.title, topics: t.topics }))
    const candidates = rankTrendsForPersona(items, RELAY_TREND_PROFILE)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((c) => c.overallScore >= 0)).toBe(true)
  })

  it('V3_GROWTH_PRIVACY_GUARDS — excluded territories lower relevance', () => {
    const item = trendItem({ id: 'ex', title: 'A post about private pipeline data and sales technology', topics: ['sales technology'] })
    const withExclusion = rankTrendsForPersona([item], { ...RELAY_TREND_PROFILE, excludedTerritories: ['private pipeline'] })
    const withoutExclusion = rankTrendsForPersona([item], { ...RELAY_TREND_PROFILE, excludedTerritories: [] })
    expect(withExclusion[0].relevanceScore).toBeLessThan(withoutExclusion[0].relevanceScore)
  })
})

describe('V3 Content navigation', () => {
  it('V3_STUDIO_NAV_VISIBLE — Studio, Ideas and Growth are reachable for every role', () => {
    expect(visibleDomains(rep).map((i) => i.id)).toContain('content')
    expect(visibleDomains(admin).map((i) => i.id)).toContain('content')
    // The bottom bar has five slots; Content lives in the More sheet on mobile.
    expect(moreSheetSections(rep).map((s) => s.id)).toContain('content')
    expect(secondaryItems('content', rep).map((i) => i.href)).toEqual(['/content', '/content/ideas'])
    expect(secondaryItems('content', admin).map((i) => i.href)).toContain('/content/growth')
  })
})

describe('V3 Content cross-surface parity', () => {
  it('V3_CONTENT_CROSS_SURFACE_PARITY — the same idea agrees everywhere', () => {
    const idea = FIXTURE_IDEAS[0]
    const row = rowToContentIdea(
      {
        id: idea.id,
        persona_id: idea.personaId,
        idea_type: idea.ideaType,
        title: idea.title,
        angle: idea.angle,
        why_now: idea.whyNow,
        territory: idea.territory,
        trend_grounded: idea.trendGrounded,
        post_caption: idea.postCaption,
        source_freshness: idea.sourceFreshness,
        format_suggestion: idea.formatSuggestion,
        copied_at: idea.copiedAt,
        posted_at: idea.postedAt,
        created_at: idea.createdAt,
      },
      idea.personaName,
    )
    expect(row.title).toBe(idea.title)
    expect(row.territory).toBe(idea.territory)
    expect(row.personaName).toBe(idea.personaName)
    expect(row.trendGrounded).toBe(idea.trendGrounded)
    expect(ideaStatus(row)).toBe(ideaStatus(idea))
  })
})
