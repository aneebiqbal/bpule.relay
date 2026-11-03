import { describe, expect, it } from 'vitest'
import {
  NAV_DOMAINS,
  domainForPathname,
  mobileNavItems,
  moreSheetSections,
  navBreadcrumb,
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
    ['/profile-intelligence', 'admin'],
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
    expect(resolvePrimaryActiveId('/notifications', admin)).toBeNull()
    expect(resolvePrimaryActiveId('/onboarding', admin)).toBeNull()
  })
})

describe('V3_NAV_SECONDARY_SINGLE_ACTIVE', () => {
  it('resolves /leads?view=pipeline to Pipeline, not its Leads alias', () => {
    expect(resolveSecondaryActiveId('sales', '/leads', search('view=pipeline'), rep)).toBe('pipeline')
    expect(resolveSecondaryActiveId('sales', '/leads', search(''), rep)).toBe('leads')
  })

  it('resolves Inbox view params to one queue item each', () => {
    expect(resolveSecondaryActiveId('inbox', '/chats', search('view=waiting_me'), rep)).toBe('needs-reply')
    expect(resolveSecondaryActiveId('inbox', '/chats', search('view=followups'), rep)).toBe('followups')
    expect(resolveSecondaryActiveId('inbox', '/chats', search(''), rep)).toBeNull()
  })

  it('resolves Work view params to one task view each', () => {
    expect(resolveSecondaryActiveId('work', '/tasks', search('view=today'), rep)).toBe('today')
    expect(resolveSecondaryActiveId('work', '/tasks', search('view=overdue'), rep)).toBe('overdue')
    expect(resolveSecondaryActiveId('work', '/tasks', search(''), rep)).toBe('tasks')
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

  it('gives every destination exactly one label', () => {
    const labels = NAV_DOMAINS.flatMap((d) => [d.label, ...d.secondary.map((i) => i.label)])
    expect(new Set(labels).size).toBe(labels.length)
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
    expect(byHref('/reports/sales')).toBe('Sales Insights')
    expect(byHref('/content')).toBe('Studio')
    expect(byHref('/team')).toBe('Overview')
    expect(byHref('/team/people')).toBe('People')
    expect(adminItem('/admin/command')).toBe('Command Center')
    expect(byHref('/admin/scoring-qa')).toBe('Scoring QA')
    expect(byHref('/profile-intelligence')).toBe('Profiles')
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

  it('Manage Profiles is owner-only', () => {
    expect(secondaryItems('admin', owner).map((i) => i.href)).toContain('/manage-profiles')
    expect(secondaryItems('admin', admin).map((i) => i.href)).not.toContain('/manage-profiles')
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
    ['/manage-profiles', owner],
    ['/revenue/email', rep],
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

  it('More sheet contains every domain the bottom bar omits', () => {
    const repSheet = moreSheetSections(rep)
    expect(repSheet.map((s) => s.id)).toContain('work')
    expect(repSheet.map((s) => s.id)).toContain('content')
    expect(repSheet.map((s) => s.id)).toContain('insights')
    expect(repSheet.map((s) => s.id)).toContain('settings')
    expect(repSheet.map((s) => s.id)).not.toContain('home')
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
    expect(domainForPathname('/relay')).toBe('inbox')
    expect(domainForPathname('/archive')).toBe('sales')
  })
})
