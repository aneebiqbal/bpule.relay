import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStore = vi.hoisted(() => ({
  getContentPersona: vi.fn(),
  createContentPersona: vi.fn(),
  createContentProfile: vi.fn(),
  getContentProfile: vi.fn(),
}))

const mockUser = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/store', () => ({
  createScoutStore: () => ({
    getContentPersona: mockStore.getContentPersona,
    createContentPersona: mockStore.createContentPersona,
    createContentProfile: mockStore.createContentProfile,
    getContentProfile: mockStore.getContentProfile,
    getDailyContentBriefWithIdeas: vi.fn().mockResolvedValue(null),
    listContentMemories: vi.fn().mockResolvedValue([]),
    getTasteProfile: vi.fn().mockResolvedValue(null),
    listTrendItems: vi.fn().mockResolvedValue([]),
    getLatestDailyContentBrief: vi.fn().mockResolvedValue(null),
    createDailyContentBrief: vi.fn(),
    createDailyContentIdea: vi.fn(),
    updateDailyContentBriefRecommended: vi.fn(),
    updateDailyContentBriefStatus: vi.fn(),
  }),
}))

vi.mock('@/lib/auth/current', () => ({
  getCurrentUser: mockUser.getCurrentUser,
}))

import { POST } from '@/app/api/content/intelligence/v2/daily-brief/route'

const demoUser = {
  rep: { id: 'rep-hassan', name: 'Hassan', role: 'admin', organizationId: 'org-demo', timezone: 'UTC' },
  profile: { id: 'vp-hassan' },
}

function postBody(personaId: string, platform = 'linkedin') {
  return new Request('http://localhost/api/content/intelligence/v2/daily-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personaId, platform }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUser.getCurrentUser.mockResolvedValue(demoUser)
})

describe('Studio daily-brief profile guard (BUG-13 / BUG-14)', () => {
  it('returns 422 with an actionable message when persona has no content profile', async () => {
    mockStore.getContentPersona.mockResolvedValue({
      id: 'persona-noprofile',
      repId: 'rep-hassan',
      organizationId: 'org-demo',
      displayName: 'No Profile Persona',
      platforms: ['linkedin'],
      contentProfileId: null,
    })

    const res = await POST(postBody('persona-noprofile'))
    const data = await res.json()

    expect(res.status).toBe(422)
    expect(data.error).toBe('Persona has no content profile')
    expect(data.personaId).toBe('persona-noprofile')
    expect(data.message).toMatch(/set up|content profile/i)
  })

  it('returns 404 when persona does not exist', async () => {
    mockStore.getContentPersona.mockResolvedValue(null)

    const res = await POST(postBody('persona-missing'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when persona belongs to another rep and user is not admin', async () => {
    mockUser.getCurrentUser.mockResolvedValue({
      ...demoUser,
      rep: { ...demoUser.rep, role: 'rep' },
    })
    mockStore.getContentPersona.mockResolvedValue({
      id: 'persona-other',
      repId: 'rep-someone-else',
      organizationId: 'org-demo',
      displayName: 'Other Persona',
      platforms: ['linkedin'],
      contentProfileId: 'profile-other',
    })

    const res = await POST(postBody('persona-other'))
    expect(res.status).toBe(403)
  })
})
