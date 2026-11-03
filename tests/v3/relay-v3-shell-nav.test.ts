/** Relay V3 shell navigation contracts. */
import { describe, expect, it } from 'vitest'
import {
  mobileNavItems,
  resolvePrimaryActiveId,
  resolveSecondaryActiveId,
  secondaryItems,
  visibleDomains,
  type RelayNavRoleFlags,
} from '@/lib/navigation/relay-shell-nav'
import { buildGlobalCreateItems } from '@/lib/navigation/global-create-items'

const rep: RelayNavRoleFlags = { isOwner: false, isAdmin: false, isManager: false }
const manager: RelayNavRoleFlags = { isOwner: false, isAdmin: false, isManager: true }
const admin: RelayNavRoleFlags = { isOwner: false, isAdmin: true, isManager: true }

const search = (query = '') => new URLSearchParams(query)

describe('RELAY_V3_SINGLE_ACTIVE_NAV_ITEM', () => {
  it('resolves /leads to exactly the Leads item, not its Pipeline alias', () => {
    expect(resolveSecondaryActiveId('sales', '/leads', search(''), rep)).toBe('leads')
    expect(resolveSecondaryActiveId('sales', '/leads', search('view=pipeline'), rep)).toBe('pipeline')
  })

  it('resolves home, inbox and work to one item each', () => {
    expect(resolvePrimaryActiveId('/dashboard', rep)).toBe('home')
    expect(resolvePrimaryActiveId('/chats', rep)).toBe('inbox')
    expect(resolvePrimaryActiveId('/tasks', rep)).toBe('work')
  })

  it('lights exactly one primary destination per route', () => {
    expect(resolvePrimaryActiveId('/dashboard', rep)).toBe('home')
    expect(resolvePrimaryActiveId('/leads', rep)).toBe('sales')
    expect(resolvePrimaryActiveId('/chats', rep)).toBe('inbox')
    expect(resolvePrimaryActiveId('/tasks', rep)).toBe('work')
    expect(resolvePrimaryActiveId('/reports/pipeline', rep)).toBe('insights')
    expect(resolvePrimaryActiveId('/admin/command', admin)).toBe('team')
    expect(resolvePrimaryActiveId('/settings', rep)).toBe('settings')
  })

  it('keeps section context on routes without a dedicated item', () => {
    expect(resolvePrimaryActiveId('/prospect', rep)).toBe('sales')
    expect(resolvePrimaryActiveId('/upwork', rep)).toBe('sales')
    expect(resolvePrimaryActiveId('/leads/import', rep)).toBe('sales')
  })

  it('keeps the primary sidebar role-gated', () => {
    expect(visibleDomains(rep).map((i) => i.id)).toEqual([
      'home',
      'sales',
      'inbox',
      'work',
      'content',
      'insights',
      'settings',
    ])
    expect(visibleDomains(admin).map((i) => i.id)).toContain('admin')
  })
})

describe('V3_NO_PARALLEL_SELECTED_NAV', () => {
  const paths = [
    '/dashboard',
    '/leads',
    '/leads/import',
    '/prospect',
    '/upwork',
    '/tasks',
    '/archive',
    '/chats',
    '/relay',
    '/inbound',
    '/team',
    '/team/people',
    '/team/workload',
    '/content/ideas',
    '/reports/sales',
  ]

  it('never lights two primary items for any route', () => {
    for (const pathname of paths) {
      const domain = resolvePrimaryActiveId(pathname, admin)
      if (!domain) continue
      const active = resolveSecondaryActiveId(domain, pathname, search(''), admin)
      if (active === null) continue
      expect(secondaryItems(domain, admin).filter((i) => i.id === active)).toHaveLength(1)
    }
  })
})

describe('V3_SINGLE_ACTIVE_NAV', () => {
  it('derives exactly one active mobile destination per route', () => {
    const mobileIds = new Set(mobileNavItems(admin).map((i) => i.id))
    for (const pathname of ['/dashboard', '/leads', '/chats', '/team', '/reports/sales']) {
      const domain = resolvePrimaryActiveId(pathname, admin)
      expect(domain, pathname).not.toBeNull()
      if (!mobileIds.has(domain!)) continue
      const active = mobileNavItems(admin).filter((item) => item.id === domain)
      expect(active, pathname).toHaveLength(1)
    }
  })
})

describe('V3_ROLE_NAV', () => {
  it('admin sees org surfaces a rep never does', () => {
    const adminIds = new Set(visibleDomains(admin).map((i) => i.id))
    const repIds = new Set(visibleDomains(rep).map((i) => i.id))
    expect(adminIds.has('admin')).toBe(true)
    expect(repIds.has('admin')).toBe(false)
  })

  it('managers see team; reps do not', () => {
    expect(mobileNavItems(manager).some((i) => i.id === 'team')).toBe(true)
    expect(mobileNavItems(rep).some((i) => i.id === 'team')).toBe(false)
  })
})

describe('V3_MOBILE_NAV', () => {
  it('exposes the core destinations with unique ids', () => {
    const items = mobileNavItems(rep)
    const ids = items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(items.some((i) => i.label === 'Sales' && i.href === '/leads')).toBe(true)
  })
})

describe('V3_GLOBAL_CREATE', () => {
  it('defaults to Analyze Prospect for reps', () => {
    const items = buildGlobalCreateItems(false)
    expect(items[0]).toMatchObject({ label: 'Analyze Prospect', href: '/prospect', default: true })
    expect(items.some((i) => i.key === 'invite')).toBe(false)
  })

  it('adds Invite Person for admins', () => {
    const items = buildGlobalCreateItems(true)
    expect(items.some((i) => i.label === 'Invite Person' && i.href === '/admin/people')).toBe(true)
    expect(items[0].label).toBe('Analyze Prospect')
  })

  it('exposes Upwork and Studio creation for every role', () => {
    const items = buildGlobalCreateItems(false)
    expect(items.some((i) => i.label === 'Add Upwork Job' && i.href === '/upwork/new')).toBe(true)
    expect(items.some((i) => i.label === 'Create Studio Idea')).toBe(true)
  })
})

describe('V3_NAV_HIDDEN_FEATURES_EXPOSED', () => {
  it('leads import is reachable from the Sales rail', () => {
    expect(secondaryItems('sales', rep).map((i) => i.href)).toContain('/leads/import')
  })
})

describe('V3_CONTENT_NAV', () => {
  it('Studio and Ideas are reachable for every role', () => {
    const hrefs = secondaryItems('content', rep).map((i) => i.href)
    expect(hrefs).toContain('/content')
    expect(hrefs).toContain('/content/ideas')
  })

  it('Growth is admin/owner only', () => {
    expect(secondaryItems('content', rep).map((i) => i.href)).not.toContain('/content/growth')
    expect(secondaryItems('content', admin).map((i) => i.href)).toContain('/content/growth')
  })

  it('Work views resolve through the ?view param the page actually reads', () => {
    expect(resolveSecondaryActiveId('work', '/tasks', search('view=overdue'), rep)).toBe('overdue')
    expect(resolveSecondaryActiveId('work', '/tasks', search('view=completed'), rep)).toBe('completed')
  })
})
