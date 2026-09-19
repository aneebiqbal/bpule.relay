import { describe, it, expect } from 'vitest'

// Regression test: Admin API responses must use camelCase DTOs.
// Raw Supabase rows use snake_case. These mappers are the contract boundary.

function mapAssignment(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    revenueIdentityId: row.revenue_identity_id as string,
    repId: row.rep_id as string,
    assignedBy: row.assigned_by as string,
    createdAt: row.created_at as string,
  }
}

function mapTarget(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    repId: row.rep_id as string,
    revenueIdentityId: row.revenue_identity_id as string,
    activityType: row.activity_type,
    targetCount: row.target_count as number,
    active: row.active as boolean,
    createdBy: (row.created_by as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapIdentity(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    slug: row.slug as string,
    identityName: row.identity_name as string,
    title: (row.title as string) ?? null,
    profileUrl: (row.profile_url as string) ?? null,
    skills: Array.isArray(row.skills) ? row.skills as string[] : [],
    expertise: Array.isArray(row.expertise) ? row.expertise as string[] : [],
    industries: Array.isArray(row.industries) ? row.industries as string[] : [],
    technologies: Array.isArray(row.technologies) ? row.technologies as string[] : [],
    allowedFirstPersonClaims: Array.isArray(row.allowed_first_person_claims) ? row.allowed_first_person_claims as string[] : [],
    forbiddenClaims: Array.isArray(row.forbidden_claims) ? row.forbidden_claims as string[] : [],
    channelRules: row.channel_rules && typeof row.channel_rules === 'object' ? row.channel_rules as Record<string, unknown> : {},
  }
}

function assertNoSnakeCase(obj: Record<string, unknown>, path = ''): void {
  for (const key of Object.keys(obj)) {
    const fullPath = path ? `${path}.${key}` : key
    if (key.includes('_')) {
      throw new Error(`Snake_case key leaked: ${fullPath}`)
    }
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      assertNoSnakeCase(obj[key] as Record<string, unknown>, fullPath)
    }
  }
}

describe('Admin API response contracts', () => {
  it('mapAssignment produces camelCase DTO', () => {
    const raw = {
      id: 'a1',
      organization_id: 'org1',
      revenue_identity_id: 'ri1',
      rep_id: 'rep1',
      assigned_by: 'admin1',
      created_at: '2026-01-01',
    }
    const dto = mapAssignment(raw)
    expect(dto).toEqual({
      id: 'a1',
      organizationId: 'org1',
      revenueIdentityId: 'ri1',
      repId: 'rep1',
      assignedBy: 'admin1',
      createdAt: '2026-01-01',
    })
    assertNoSnakeCase(dto as unknown as Record<string, unknown>)
  })

  it('mapTarget produces camelCase DTO', () => {
    const raw = {
      id: 't1',
      organization_id: 'org1',
      rep_id: 'rep1',
      revenue_identity_id: 'ri1',
      activity_type: 'outreach',
      target_count: 10,
      active: true,
      created_by: 'admin1',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    }
    const dto = mapTarget(raw)
    expect(dto.organizationId).toBe('org1')
    expect(dto.repId).toBe('rep1')
    expect(dto.revenueIdentityId).toBe('ri1')
    expect(dto.activityType).toBe('outreach')
    assertNoSnakeCase(dto as unknown as Record<string, unknown>)
  })

  it('mapIdentity produces camelCase DTO', () => {
    const raw = {
      id: 'i1',
      organization_id: 'org1',
      slug: 'senior-fullstack',
      identity_name: 'Senior Fullstack',
      title: 'Senior Fullstack Engineer',
      profile_url: 'https://example.com',
      skills: ['react', 'node'],
      expertise: ['web'],
      industries: ['saas'],
      technologies: ['typescript'],
      allowed_first_person_claims: ['built X'],
      forbidden_claims: ['claimed Y'],
      channel_rules: { tone: 'direct' },
    }
    const dto = mapIdentity(raw)
    expect(dto.slug).toBe('senior-fullstack')
    expect(dto.identityName).toBe('Senior Fullstack')
    expect(dto.skills).toEqual(['react', 'node'])
    assertNoSnakeCase(dto as unknown as Record<string, unknown>)
  })

  it('mapIdentity handles null/empty optional fields', () => {
    const raw = {
      id: 'i2',
      organization_id: 'org1',
      slug: 'test',
      identity_name: 'Test',
      title: null,
      profile_url: null,
      skills: null,
      expertise: null,
      industries: null,
      technologies: null,
      allowed_first_person_claims: null,
      forbidden_claims: null,
      channel_rules: null,
    }
    const dto = mapIdentity(raw)
    expect(dto.title).toBeNull()
    expect(dto.skills).toEqual([])
    expect(dto.channelRules).toEqual({})
    assertNoSnakeCase(dto as unknown as Record<string, unknown>)
  })
})
