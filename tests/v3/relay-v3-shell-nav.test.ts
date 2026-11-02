/** Relay V3 shell navigation contracts. */
import { describe, expect, it } from 'vitest'
import {
  detectRelayShellSection,
  resolveSectionActiveItem,
  resolveV3SidebarActiveId,
  sectionNavItems,
  v3MobileNavItems,
  v3SidebarItems,
  visibleTopNav,
  type RelayNavRoleFlags,
} from '@/lib/navigation/relay-shell-nav'
import { buildGlobalCreateItems } from '@/lib/navigation/global-create-items'

const rep: RelayNavRoleFlags = { isOwner: false, isAdmin: false, isManager: false }
const manager: RelayNavRoleFlags = { isOwner: false, isAdmin: false, isManager: true }
const admin: RelayNavRoleFlags = { isOwner: false, isAdmin: true, isManager: false }

describe('RELAY_V3_SINGLE_ACTIVE_NAV_ITEM', () => {
  it('resolves /leads to exactly the Leads item, not its Pipeline alias', () => {
    const active = resolveSectionActiveItem('sales', '/leads', rep)
    expect(active).not.toBeNull()
    expect(active?.href).toBe('/leads')
    expect(active?.label).toBe('Leads')
  })

  it('resolves home, conversations and tasks to one item each', () => {
    expect(resolveSectionActiveItem('home', '/dashboard', rep)?.href).toBe('/dashboard')
    expect(resolveSectionActiveItem('conversations', '/chats', rep)?.href).toBe('/chats')
    expect(resolveSectionActiveItem('sales', '/tasks', rep)?.href).toBe('/tasks')
  })

  it('lights exactly one primary sidebar destination per route', () => {
    expect(resolveV3SidebarActiveId('/dashboard', rep)).toBe('home')
    expect(resolveV3SidebarActiveId('/leads', rep)).toBe('sales')
    expect(resolveV3SidebarActiveId('/chats', rep)).toBe('conversations')
    expect(resolveV3SidebarActiveId('/tasks', rep)).toBe('tasks')
    expect(resolveV3SidebarActiveId('/reports/pipeline', rep)).toBe('insights')
    expect(resolveV3SidebarActiveId('/admin/command', admin)).toBe('admin')
    expect(resolveV3SidebarActiveId('/settings', rep)).toBe('settings')
  })

  it('keeps the primary sidebar to the canonical six plus role-gated admin', () => {
    expect(v3SidebarItems(rep).map((i) => i.id)).toEqual(['home', 'sales', 'conversations', 'tasks', 'insights', 'settings'])
    expect(v3SidebarItems(admin).map((i) => i.id)).toContain('admin')
  })
})

describe('V3_NO_PARALLEL_SELECTED_NAV', () => {
  const paths = ['/dashboard', '/leads', '/leads/import', '/prospect', '/upwork', '/tasks', '/archive', '/chats', '/relay', '/inbound', '/team', '/reports/sales']

  it('never lights two sidebar items for any route', () => {
    for (const pathname of paths) {
      const section = detectRelayShellSection(pathname)
      const matches = sectionNavItems(section, admin).filter((item) =>
        item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`),
      )
      // Several aliases may match; the canonical resolver must pick one item,
      // and the shell compares label + href so exactly one row can be active.
      const resolved = resolveSectionActiveItem(section, pathname, admin)
      expect(resolved).not.toBeNull()
      if (matches.length > 1) {
        expect(matches.filter((m) => m.label === resolved!.label)).toHaveLength(1)
      }
    }
  })
})

describe('V3_SINGLE_ACTIVE_NAV', () => {
  it('derives exactly one active mobile destination per route', () => {
    for (const pathname of ['/dashboard', '/leads', '/chats', '/team', '/reports/sales']) {
      const section = detectRelayShellSection(pathname)
      const active = v3MobileNavItems(admin).filter((item) => item.id === section)
      expect(active).toHaveLength(1)
    }
  })
})

describe('V3_ROLE_NAV', () => {
  it('admin sees org surfaces a rep never does', () => {
    const adminIds = new Set(visibleTopNav(admin).map((i) => i.id))
    const repIds = new Set(visibleTopNav(rep).map((i) => i.id))
    expect(adminIds.has('accounts')).toBe(true)
    expect(adminIds.has('intelligence')).toBe(true)
    expect(repIds.has('accounts')).toBe(false)
  })

  it('managers see team; reps do not', () => {
    expect(v3MobileNavItems(manager).some((i) => i.id === 'team')).toBe(true)
    expect(v3MobileNavItems(rep).some((i) => i.id === 'team')).toBe(false)
  })
})

describe('V3_MOBILE_NAV', () => {
  it('exposes the core destinations with unique ids', () => {
    const items = v3MobileNavItems(rep)
    const ids = items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(items.some((i) => i.label === 'Leads' && i.href === '/leads')).toBe(true)
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
})
