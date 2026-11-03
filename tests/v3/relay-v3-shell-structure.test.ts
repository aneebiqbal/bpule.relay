/**
 * Relay V3 shell structure contract.
 *
 * There is exactly one navigation architecture: a collapsible primary sidebar,
 * one contextual secondary rail, and a quiet header. These assertions protect
 * that model from regressing into parallel nav systems.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const SHELL = 'src/components/shell/relay-app-shell.tsx'
const NAV = 'src/lib/navigation/relay-shell-nav.ts'

describe('V3_SHELL_SINGLE_NAVIGATION_ARCHITECTURE', () => {
  it('renders exactly one primary sidebar and one secondary rail', () => {
    const shell = read(SHELL)
    expect(shell.match(/aria-label="Primary navigation"/g)).toHaveLength(1)
    expect(shell.match(/aria-label=\{`\$\{config\.label\} sections`\}/g)).toHaveLength(1)
  })

  it('does not resurrect the dead duplicate shell', () => {
    expect(existsSync(join(ROOT, 'src/components/app-rail.tsx'))).toBe(false)
  })

  it('has no third navigation layer', () => {
    const shell = read(SHELL)
    // Only the primary <aside> and the secondary <aside> are navigation chrome;
    // everything else inside them is a <nav>.
    expect(shell.match(/<aside/g)?.length ?? 0).toBeLessThanOrEqual(2)
  })
})

describe('V3_SHELL_ACTIVE_STATE', () => {
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

describe('V3_SHELL_COLLAPSE', () => {
  it('exposes an accessible collapse control and persists the state', () => {
    const shell = read(SHELL)
    expect(shell).toContain("aria-expanded={!collapsed}")
    expect(shell).toContain("aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}")
    expect(shell).toContain("localStorage.setItem(COLLAPSE_KEY")
    expect(shell).toContain("localStorage.getItem(COLLAPSE_KEY)")
    expect(shell).toContain("const COLLAPSE_KEY = 'relay.primary.collapsed'")
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

describe('V3_SHELL_RESPONSIVE', () => {
  it('shows the secondary rail only where content stays usable', () => {
    const shell = read(SHELL)
    expect(shell).toContain('xl:block')
    expect(shell).toContain('xl:hidden')
  })

  it('hides the secondary rail on record detail without losing context', () => {
    const nav = read(NAV)
    expect(nav).toContain('isRecordDetailPathname')
    const shell = read(SHELL)
    expect(shell).toContain('!isRecordDetailPathname(pathname)')
  })

  it('provides a labelled mobile bottom nav and section tabs', () => {
    const shell = read(SHELL)
    expect(shell).toContain('aria-label="Mobile"')
    expect(shell).toContain('role="tablist"')
  })
})

describe('V3_SHELL_HEADER', () => {
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
