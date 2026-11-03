import { describe, expect, it } from 'vitest'
import {
  detectRelayShellSection,
  sectionNavItems,
  visibleTopNav,
} from '@/lib/navigation/relay-shell-nav'

describe('relay-shell-nav', () => {
  const rep = { isOwner: false, isAdmin: false, isManager: false }
  const manager = { isOwner: false, isAdmin: false, isManager: true }
  const admin = { isOwner: false, isAdmin: true, isManager: true }

  it('detects sections from pathname', () => {
    expect(detectRelayShellSection('/dashboard')).toBe('home')
    expect(detectRelayShellSection('/home')).toBe('home')
    expect(detectRelayShellSection('/leads/abc')).toBe('sales')
    expect(detectRelayShellSection('/tasks')).toBe('work')
    expect(detectRelayShellSection('/chats')).toBe('conversations')
    expect(detectRelayShellSection('/admin/scoring-qa')).toBe('intelligence')
  })

  it('work rail points My tasks to /tasks', () => {
    const hrefs = sectionNavItems('work', rep).map((i) => i.href)
    expect(hrefs).toContain('/tasks')
  })

  it('filters top nav for rep vs admin', () => {
    const repNav = visibleTopNav(rep).map((i) => i.id)
    expect(repNav).toContain('home')
    expect(repNav).toContain('sales')
    expect(repNav).not.toContain('accounts')
    expect(repNav).not.toContain('intelligence')

    const adminNav = visibleTopNav(admin).map((i) => i.id)
    expect(adminNav).toContain('accounts')
    expect(adminNav).toContain('intelligence')
  })

  it('shows team nav for manager', () => {
    expect(visibleTopNav(manager).some((i) => i.id === 'team')).toBe(true)
  })

  it('hides admin-only report links from reps', () => {
    const items = sectionNavItems('reports', rep).map((i) => i.href)
    expect(items).toContain('/performance')
    expect(items).not.toContain('/admin/revenue-intelligence')
  })
})
