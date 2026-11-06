import { describe, expect, it } from 'vitest'
import {
  NAV_DOMAINS,
  domainForPathname,
  mobileNavItems,
  moreSheetSections,
  navBreadcrumb,
  pageOwnsSubNav,
  resolvePrimaryActiveId,
  resolveSecondaryActiveId,
  secondaryItems,
  visibleDomains,
  type RelayNavRoleFlags,
} from '@/lib/navigation/relay-shell-nav'

const rep: RelayNavRoleFlags = { isOwner: false, isAdmin: false, isManager: false }
const manager: RelayNavRoleFlags = { isOwner: false, isAdmin: false, isManager: true }
const admin: RelayNavRoleFlags = { isOwner: false, isAdmin: true, isManager: true }
const owner: RelayNavRoleFlags = { isOwner: true, isAdmin: true, isManager: true }

const search = (query = '') => new URLSearchParams(query)

describe('V3_NAV_PRIMARY_SINGLE_ACTIVE', () => {
  const cases: Array<[string, string]> = [
    ['/dashboard', 'home'],
    ['/prospect', 'sales'],
    ['/leads', 'sales'],
    ['/leads/import', 'sales'],
    ['/upwork', 'sales'],
    ['/chats', 'inbox'],
    ['/tasks', 'work'],
    ['/team', 'team'],
    ['/team/performance', 'team'],
    ['/team/targets', 'team'],
    ['/content', 'content'],
    ['/content/ideas', 'content'],
    ['/content/growth', 'content'],
    ['/reports/sales', 'insights'],
    ['/admin/ai-usage', 'insights'],
    ['/admin/revenue-intelligence', 'insights'],
    ['/admin/command', 'team'],
    ['/admin/people', 'admin'],
    ['/admin/scoring-qa', 'admin'],
    ['/profile-intelligence', 'team'],
    ['/settings', 'settings'],
  ]

  it('resolves exactly one primary domain per route', () => {
    for (const [pathname, expected] of cases) {
      expect(resolvePrimaryActiveId(pathname, admin), pathname).toBe(expected)
      // Domain detection and role-aware resolution must agree for a permitted role.
      expect(resolvePrimaryActiveId(pathname, admin), pathname).toBe(domainForPathname(pathname))
    }
  })

  it('maps routes with no dedicated domain to null, not a wrong guess', () => {
    expect(resolvePrimaryActiveId('/onboarding', admin)).toBeNull()
    expect(resolvePrimaryActiveId('/verify-email', admin)).toBeNull()
  })
})

describe('V3_NAV_SECONDARY_SINGLE_ACTIVE', () => {
  it('resolves /leads?view=pipeline to Pipeline, not its Leads alias', () => {
    expect(resolveSecondaryActiveId('sales', '/leads', search('view=pipeline'), rep)).toBe('pipeline')
    expect(resolveSecondaryActiveId('sales', '/leads', search(''), rep)).toBe('leads')
  })

  it('resolves Inbox view params to one queue item each', () => {
    expect(resolveSecondaryActiveId('inbox', '/chats', search('view=waiting_me'), rep)).toBe('needs-reply')
    expect(resolveSecondaryActiveId('inbox', '/chats', search('view=followups'), rep)).toBe('follow-ups')
    expect(resolveSecondaryActiveId('inbox', '/chats', search('view=all'), rep)).toBe('all')
  })

  it('resolves the role default immediately when no view is in the URL', () => {
    expect(resolveSecondaryActiveId('inbox', '/chats', search(''), rep)).toBe('needs-reply')
    expect(resolveSecondaryActiveId('inbox', '/chats', search('lead=abc'), rep)).toBe('needs-reply')
    expect(resolveSecondaryActiveId('inbox', '/chats', search(''), admin)).toBe('all')
  })

  it('leaves secondary conditions to the Filters drawer (no sidebar item)', () => {
    for (const view of ['meeting_requests', 'proposal_requests', 'closed', 'over4h', 'over12h', 'unassigned', 'review']) {
      expect(resolveSecondaryActiveId('inbox', '/chats', search(`view=${view}`), admin)).toBeNull()
    }
  })

  it('resolves Work view params to one task view each', () => {
    expect(resolveSecondaryActiveId('work', '/tasks', search('view=today'), rep)).toBe('today')
    expect(resolveSecondaryActiveId('work', '/tasks', search('view=overdue'), rep)).toBe('overdue')
    expect(resolveSecondaryActiveId('work', '/tasks', search(''), rep)).toBe('my-tasks')
  })

  it('resolves exactly one active secondary item across the route matrix', () => {
    const paths: Array<[string, string, RelayNavRoleFlags]> = [
      ['/prospect', '', rep],
      ['/leads', '', rep],
      ['/leads', 'view=pipeline', rep],
      ['/leads/import', '', rep],
      ['/upwork', '', rep],
      ['/revenue/email', '', rep],
      ['/chats', 'view=closed', rep],
      ['/tasks', 'view=upcoming', rep],
      ['/team', '', manager],
      ['/team/people', '', manager],
      ['/team/workload', '', manager],
      ['/team/activity', '', manager],
      ['/team/targets', '', manager],
      ['/admin/command', '', manager],
      ['/content', '', rep],
      ['/content/ideas', '', rep],
      ['/content/growth', '', admin],
      ['/reports/sales', '', rep],
      ['/admin/ai-usage', '', admin],
      ['/admin/people', '', admin],
      ['/profile-intelligence', '', admin],
      ['/admin/scoring-qa', '', admin],
      ['/settings', '', rep],
    ]
    for (const [pathname, query, role] of paths) {
      const domain = resolvePrimaryActiveId(pathname, role)
      expect(domain, pathname).not.toBeNull()
      const active = resolveSecondaryActiveId(domain!, pathname, search(query), role)
      if (active === null) continue
      const matching = secondaryItems(domain!, role).filter((i) => i.id === active)
      expect(matching, pathname).toHaveLength(1)
    }
  })
})

describe('V3_NAV_CANONICAL_LABELS', () => {
  const banned = [
    'Chats',
    'Conversations',
    'Find leads',
    'Open Team',
    'Daily operations',
    'Search profile',
    'Relay Growth',
  ]

  it('uses no legacy alias as a navigation label', () => {
    const labels = NAV_DOMAINS.flatMap((d) => [d.label, ...d.secondary.map((i) => i.label)])
    for (const alias of banned) {
      expect(labels, alias).not.toContain(alias)
    }
  })

  it('gives every destination exactly one label within its domain', () => {
    for (const domain of NAV_DOMAINS) {
      const labels = [domain.label, ...domain.secondary.map((i) => i.label)]
      expect(new Set(labels).size, domain.id).toBe(labels.length)
    }
  })

  it('uses the canonical label for each mapped destination', () => {
    const byHref = (href: string) =>
      NAV_DOMAINS.flatMap((d) => d.secondary).find((i) => i.href === href)?.label
    const domainLabel = (href: string) => NAV_DOMAINS.find((d) => d.href === href)?.label
    expect(domainLabel('/chats')).toBe('Inbox')
    expect(domainLabel('/leads')).toBe('Sales')
    expect(domainLabel('/content')).toBe('Content')
    expect(domainLabel('/reports/sales')).toBe('Insights')
    expect(domainLabel('/admin/command')).toBe('Admin')
    const adminItem = (href: string) =>
      NAV_DOMAINS.find((d) => d.id === 'admin')!.secondary.find((i) => i.href === href)?.label
    expect(byHref('/leads')).toBe('Leads')
    expect(byHref('/leads?view=pipeline')).toBe('Pipeline')
    expect(byHref('/reports/sales')).toBe('Sales')
    expect(byHref('/content')).toBe('Studio')
    expect(byHref('/team')).toBe('Overview')
    expect(byHref('/team/people')).toBe('People')
    expect(adminItem('/admin/command')).toBe('Command Center')
    expect(byHref('/admin/scoring-qa')).toBe('Scoring QA')
    expect(byHref('/profile-intelligence?tab=identities')).toBe('Identities')
    expect(byHref('/team/profiles')).toBe('Profiles')
    expect(byHref('/team/coverage')).toBe('Coverage')
    expect(byHref('/content/growth')).toBe('Growth')
    expect(byHref('/admin/people')).toBe('People & Roles')
    expect(byHref('/admin/revenue-intelligence')).toBe('Revenue Intelligence')
    expect(byHref('/upwork')).toBe('Upwork')
    expect(byHref('/prospect')).toBe('Prospects')
  })
})

describe('V3_NAV_ROLE_VISIBILITY', () => {
  it('rep sees Home, Sales, Inbox, Work, Content, Insights, Settings', () => {
    expect(visibleDomains(rep).map((d) => d.id)).toEqual([
      'home',
      'sales',
      'inbox',
      'work',
      'content',
      'insights',
      'settings',
    ])
  })

  it('manager adds Team but not Admin', () => {
    const ids = visibleDomains(manager).map((d) => d.id)
    expect(ids).toContain('team')
    expect(ids).not.toContain('admin')
  })

  it('admin and owner see Admin', () => {
    expect(visibleDomains(admin).map((d) => d.id)).toContain('admin')
    expect(visibleDomains(owner).map((d) => d.id)).toContain('admin')
  })

  it('managers reach Daily Operations through Team, not Admin', () => {
    expect(secondaryItems('team', manager).map((i) => i.href)).toContain('/admin/command')
    expect(secondaryItems('team', admin).map((i) => i.href)).not.toContain('/admin/command')
    expect(secondaryItems('admin', admin).map((i) => i.href)).toContain('/admin/command')
  })

  it('admin-only secondary items are hidden from reps and managers', () => {
    for (const role of [rep, manager]) {
      expect(secondaryItems('sales', role).map((i) => i.href)).not.toContain('/accounts')
      expect(secondaryItems('content', role).map((i) => i.href)).not.toContain('/content/growth')
      expect(secondaryItems('insights', role).map((i) => i.href)).not.toContain('/admin/ai-usage')
    }
  })

  it('profiles are a Team capability, not an owner-only admin extra', () => {
    expect(secondaryItems('team', manager).map((i) => i.href)).toContain('/team/profiles')
    expect(secondaryItems('team', admin).map((i) => i.href)).toContain('/team/profiles')
    expect(secondaryItems('admin', owner).map((i) => i.href)).not.toContain('/manage-profiles')
    expect(NAV_DOMAINS.find((d) => d.id === 'admin')!.secondary.map((i) => i.href)).not.toContain(
      '/manage-profiles',
    )
  })
})

describe('V3_NAV_HIDDEN_FEATURES_EXPOSED', () => {
  const required: Array<[string, RelayNavRoleFlags]> = [
    ['/leads/import', rep],
    ['/upwork', rep],
    ['/team/targets', manager],
    ['/team/groups', manager],
    ['/content', rep],
    ['/content/ideas', rep],
    ['/content/growth', admin],
    ['/admin/scoring-qa', admin],
    ['/admin/qa', admin],
    ['/admin/dataset', admin],
    ['/admin/training-data', admin],
    ['/admin/ai-usage', admin],
    ['/revenue/email', rep],
    ['/team/profiles', manager],
    ['/team/coverage', manager],
    ['/profile-intelligence?tab=identities', manager],
  ]

  it('every formerly hidden feature has a nav entry point', () => {
    for (const [href, role] of required) {
      const domain = resolvePrimaryActiveId(new URL(href, 'https://relay.test').pathname, role)
      expect(domain, href).not.toBeNull()
      const items = secondaryItems(domain!, role).map((i) => i.href)
      expect(items, `${href} for role ${JSON.stringify(role)}`).toContain(href)
    }
  })

  it('V3_STUDIO_NAV_VISIBLE: Studio is directly reachable from the Content domain', () => {
    const content = visibleDomains(rep).find((d) => d.id === 'content')
    expect(content).toBeDefined()
    expect(content!.secondary.map((i) => i.href)).toContain('/content')
  })

  it('V3_CONTENT_RAIL: Studio and Ideas for every role, Growth for admins', () => {
    const repHrefs = secondaryItems('content', rep).map((i) => i.href)
    expect(repHrefs).toContain('/content')
    expect(repHrefs).toContain('/content/ideas')
    expect(repHrefs).not.toContain('/content/growth')
    expect(secondaryItems('content', admin).map((i) => i.href)).toContain('/content/growth')
  })
})

describe('V3_NAV_BREADCRUMB', () => {
  it('builds a two-level breadcrumb from the canonical hierarchy', () => {
    expect(navBreadcrumb('/leads', search(''), rep)).toMatchObject({
      domainLabel: 'Sales',
      itemLabel: 'Leads',
    })
    expect(navBreadcrumb('/leads', search('view=pipeline'), rep)).toMatchObject({
      domainLabel: 'Sales',
      itemLabel: 'Pipeline',
    })
    expect(navBreadcrumb('/team/performance', search(''), manager)).toMatchObject({
      domainLabel: 'Team',
      itemLabel: 'Performance',
    })
    expect(navBreadcrumb('/admin/scoring-qa', search(''), admin)).toMatchObject({
      domainLabel: 'Admin',
      itemLabel: 'Scoring QA',
    })
  })

  it('omits the item level when the domain has no matching secondary item', () => {
    expect(navBreadcrumb('/dashboard', search(''), rep)).toMatchObject({
      domainLabel: 'Home',
      itemLabel: null,
    })
  })
})

describe('V3_NAV_MOBILE', () => {
  it('rep gets Home, Sales, Inbox, Work, More', () => {
    expect(mobileNavItems(rep).map((i) => i.id)).toEqual(['home', 'sales', 'inbox', 'work', 'more'])
  })

  it('manager gets Home, Sales, Inbox, Team, More', () => {
    expect(mobileNavItems(manager).map((i) => i.id)).toEqual(['home', 'sales', 'inbox', 'team', 'more'])
  })

  it('More sheet contains every domain the bottom bar omits, and nothing it already shows', () => {
    const repSheet = moreSheetSections(rep)
    const repBottomBar = mobileNavItems(rep).map((i) => i.id)
    expect(repSheet.map((s) => s.id)).toEqual(['content', 'insights', 'settings'])
    for (const id of repSheet.map((s) => s.id)) {
      expect(repBottomBar).not.toContain(id)
    }

    const managerSheet = moreSheetSections(manager)
    expect(managerSheet.map((s) => s.id)).toEqual(['work', 'content', 'insights', 'settings'])
    expect(managerSheet.map((s) => s.id)).not.toContain('team')
  })

  it('More sheet never lists a domain the role cannot open', () => {
    expect(moreSheetSections(rep).map((s) => s.id)).not.toContain('admin')
    expect(moreSheetSections(manager).map((s) => s.id)).not.toContain('admin')
    expect(moreSheetSections(admin).map((s) => s.id)).toContain('admin')
  })
})

describe('domainForPathname', () => {
  it('routes admin-owned URLs to the domain that owns the feature', () => {
    expect(domainForPathname('/admin/command')).toBe('team')
    expect(domainForPathname('/admin/command/abc')).toBe('team')
    expect(domainForPathname('/admin/ai-usage')).toBe('insights')
    expect(domainForPathname('/admin/revenue-intelligence')).toBe('insights')
    expect(domainForPathname('/admin/people')).toBe('admin')
  })

  it('keeps conversation surfaces under Inbox', () => {
    expect(domainForPathname('/chats')).toBe('inbox')
    expect(domainForPathname('/inbound')).toBe('inbox')
    expect(domainForPathname('/archive')).toBe('sales')
  })

  it('no longer resolves deleted routes', () => {
    expect(domainForPathname('/relay')).toBeNull()
  })
})

// ─── Final shell contract (Phases 5–6, 24) ──────────────────────────────────

const ROUTE_MATRIX: Array<[string, string]> = [
  ['/dashboard', 'home'],
  ['/prospect', 'sales'],
  ['/leads', 'sales'],
  ['/leads/l1', 'sales'],
  ['/chats', 'inbox'],
  ['/tasks', 'work'],
  ['/team', 'team'],
  ['/team/m1', 'team'],
  ['/content', 'content'],
  ['/content/ideas', 'content'],
  ['/content/growth', 'content'],
  ['/reports/sales', 'insights'],
  ['/reports/pipeline', 'insights'],
  ['/reports/team', 'insights'],
  ['/reports/revenue', 'insights'],
  ['/settings', 'settings'],
  ['/notifications', 'settings'],
  ['/admin/command', 'team'],
  ['/admin/people', 'admin'],
]

describe('V3_PRIMARY_NAV_SINGLE_ACTIVE', () => {
  it('resolves exactly one primary domain for every route in the matrix', () => {
    for (const [pathname, expected] of ROUTE_MATRIX) {
      expect(resolvePrimaryActiveId(pathname, admin), pathname).toBe(expected)
    }
  })

  it('never resolves two primary domains for one route', () => {
    for (const [pathname] of ROUTE_MATRIX) {
      const active = visibleDomains(admin).filter((d) => resolvePrimaryActiveId(pathname, admin) === d.id)
      expect(active, pathname).toHaveLength(1)
    }
  })
})

describe('V3_SECONDARY_NAV_SINGLE_ACTIVE', () => {
  it('resolves at most one secondary item per route', () => {
    for (const [pathname] of ROUTE_MATRIX) {
      const domain = resolvePrimaryActiveId(pathname, admin)
      if (!domain) continue
      const active = resolveSecondaryActiveId(domain, pathname, search(''), admin)
      if (!active) continue
      expect(
        secondaryItems(domain, admin).filter((i) => i.id === active),
        pathname,
      ).toHaveLength(1)
    }
  })

  it('resolves query-scoped views to exactly one item', () => {
    expect(resolveSecondaryActiveId('sales', '/leads', search('view=pipeline'), admin)).toBe('pipeline')
    expect(resolveSecondaryActiveId('work', '/tasks', search('view=overdue'), admin)).toBe('overdue')
    expect(resolveSecondaryActiveId('work', '/tasks', search('scope=team'), admin)).toBe('team-tasks')
    expect(resolveSecondaryActiveId('inbox', '/chats', search('view=waiting_me'), admin)).toBe('needs-reply')
  })
})

describe('V3_NAV_ROUTE_MATRIX', () => {
  const expectations: Array<[string, string, string | null]> = [
    ['/dashboard', 'home', null],
    ['/prospect', 'sales', 'prospects'],
    ['/leads', 'sales', 'leads'],
    ['/leads/import', 'sales', 'import'],
    ['/chats', 'inbox', 'all'],
    ['/tasks', 'work', 'my-tasks'],
    ['/content', 'content', 'studio'],
    ['/content/ideas', 'content', 'ideas'],
    ['/content/growth', 'content', 'growth'],
    ['/reports/sales', 'insights', 'sales-insights'],
    ['/reports/pipeline', 'insights', 'pipeline-report'],
    ['/reports/team', 'insights', 'team-report'],
    ['/reports/revenue', 'insights', 'revenue-report'],
    ['/settings', 'settings', 'account'],
    ['/admin/people', 'admin', 'people-roles'],
  ]

  it('maps every route to its domain and secondary destination', () => {
    for (const [pathname, domain, secondaryId] of expectations) {
      expect(resolvePrimaryActiveId(pathname, admin), pathname).toBe(domain)
      expect(resolveSecondaryActiveId(domain, pathname, search(''), admin), pathname).toBe(secondaryId)
    }
  })

  it('never leaves a real feature without a rail entry point', () => {
    for (const [pathname, domain] of ROUTE_MATRIX) {
      const items = secondaryItems(domain, admin).map((i) => i.href)
      const resolved = resolveSecondaryActiveId(domain, pathname, search(''), admin)
      if (!resolved) continue
      expect(items, pathname).toContain(
        secondaryItems(domain, admin).find((i) => i.id === resolved)!.href,
      )
    }
  })
})

describe('V3_NESTED_ROUTE_SELECTION', () => {
  it('keeps the parent destination active on record detail', () => {
    expect(resolvePrimaryActiveId('/leads/l1', rep)).toBe('sales')
    expect(resolveSecondaryActiveId('sales', '/leads/l1', search(''), rep)).toBe('leads')
    expect(resolvePrimaryActiveId('/accounts/acme', admin)).toBe('sales')
    expect(resolveSecondaryActiveId('sales', '/accounts/acme', search(''), admin)).toBe('companies')
    expect(resolvePrimaryActiveId('/profile-intelligence?tab=identities', admin)).toBe('team')
    expect(resolveSecondaryActiveId('team', '/profile-intelligence', search('tab=identities'), admin)).toBe('identities')
  })

  it('does not let a query-scoped alias claim a sibling route', () => {
    expect(resolveSecondaryActiveId('sales', '/leads/import', search(''), admin)).toBe('import')
    expect(resolveSecondaryActiveId('sales', '/leads/l1', search('view=pipeline'), admin)).toBe('leads')
  })

  it('hides the secondary rail only where the page owns its own sub-nav', () => {
    expect(pageOwnsSubNav('/chats')).toBe(true)
    expect(pageOwnsSubNav('/leads/l1')).toBe(true)
    expect(pageOwnsSubNav('/team/m1')).toBe(true)
    expect(pageOwnsSubNav('/leads')).toBe(false)
    expect(pageOwnsSubNav('/team/people')).toBe(false)
    expect(pageOwnsSubNav('/upwork/123')).toBe(false)
    expect(navBreadcrumb('/leads/l1', search(''), rep)).toMatchObject({
      domainLabel: 'Sales',
      itemLabel: 'Leads',
    })
  })
})
