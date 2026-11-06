/**
 * Relay V4 shell structure contract.
 *
 * There is exactly one navigation architecture: a primary domain sidebar and
 * one contextual section-tab strip, with a quiet header. These assertions
 * protect that model from regressing into parallel nav systems.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const SHELL = 'src/components/v4/v4-app-shell.tsx'
const NAV = 'src/lib/navigation/relay-shell-nav.ts'

describe('V4_SHELL_SINGLE_NAVIGATION_ARCHITECTURE', () => {
  it('renders exactly one primary sidebar and one section-tab strip', () => {
    const shell = read(SHELL)
    expect(shell.match(/aria-label="Primary navigation"/g)).toHaveLength(1)
    expect(shell.match(/aria-label=\{`\$\{config\.label\} sections`\}/g)).toHaveLength(1)
  })

  it('does not resurrect a dead duplicate shell', () => {
    expect(existsSync(join(ROOT, 'src/components/shell/relay-app-shell.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'src/components/app-rail.tsx'))).toBe(false)
  })

  it('has no third navigation layer', () => {
    const shell = read(SHELL)
    // Only the primary <aside> is navigation chrome; the section tabs are a
    // labelled <nav> inside the work surface.
    expect(shell.match(/<aside/g)?.length ?? 0).toBeLessThanOrEqual(2)
  })
})

describe('V4_SHELL_ACTIVE_STATE', () => {
  it('uses aria-current on the active primary and secondary items', () => {
    const shell = read(SHELL)
    expect(shell).toContain("aria-current={active ? 'page' : undefined}")
    expect(shell).toContain("aria-current={activeSecondaryId === item.id ? 'page' : undefined}")
  })

  it('resolves active state through the centralized resolvers', () => {
    const shell = read(SHELL)
    expect(shell).toContain('resolvePrimaryActiveId(pathname, roleFlags)')
    expect(shell).toContain('resolveSecondaryActiveId(activeDomain, pathname, search, roleFlags)')
  })
})

describe('V4_SHELL_COLLAPSE', () => {
  it('exposes an accessible collapse control and persists the state', () => {
    const shell = read(SHELL)
    expect(shell).toContain("aria-expanded={!collapsed}")
    expect(shell).toContain("aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}")
    expect(shell).toContain("localStorage.setItem(COLLAPSE_KEY")
    expect(shell).toContain("localStorage.getItem(COLLAPSE_KEY")
    expect(shell).toContain("const COLLAPSE_KEY = 'relay.v4.collapsed'")
  })

  it('keeps collapsed icons labelled through tooltip and accessible name', () => {
    const shell = read(SHELL)
    expect(shell).toContain('title={collapsed ? item.label : undefined}')
    expect(shell).toContain('aria-label={collapsed ?')
  })

  it('uses the specified expanded and collapsed widths', () => {
    const shell = read(SHELL)
    expect(shell).toContain('lg:w-[216px]')
    expect(shell).toContain('lg:w-[68px]')
  })
})

describe('V4_SHELL_RESPONSIVE', () => {
  it('shows the sidebar on desktop and the bottom nav on mobile', () => {
    const shell = read(SHELL)
    expect(shell).toContain('hidden h-[calc(100dvh-3rem)]')
    expect(shell).toContain('lg:flex')
    expect(shell).toContain('lg:hidden')
  })

  it('hides the section tabs on record detail without losing context', () => {
    const nav = read(NAV)
    expect(nav).toContain('pageOwnsSubNav')
    const shell = read(SHELL)
    expect(shell).toContain('!pageOwnsSubNav(pathname)')
  })

  it('provides a labelled mobile bottom nav and a labelled section-tab strip', () => {
    const shell = read(SHELL)
    expect(shell).toContain('aria-label="Mobile"')
    expect(shell).toContain('aria-label={`${config.label} sections`}')
  })
})

describe('V4_SHELL_HEADER', () => {
  it('keeps domain navigation out of the header', () => {
    const shell = read(SHELL)
    const header = shell.slice(shell.indexOf('<header'), shell.indexOf('</header>'))
    expect(header).not.toContain('visibleDomains')
    expect(header).not.toContain('secondaryGroups')
  })

  it('moves non-operational controls into the account menu', () => {
    const userMenu = read('src/components/shell/user-menu.tsx')
    for (const item of ['Account', 'Appearance', 'Preferences', 'Help & docs', 'Sign out']) {
      expect(userMenu).toContain(item)
    }
  })

  it('does not confuse the logged-in user with the sending identity', () => {
    const userMenu = read('src/components/shell/user-menu.tsx')
    expect(userMenu).not.toContain('useActiveIdentity')
  })
})
