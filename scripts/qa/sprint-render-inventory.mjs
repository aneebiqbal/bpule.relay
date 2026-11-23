/** Sprint deliverable: render 01-COMPLETE-UI-INVENTORY.md from the route inventory. */
import fs from 'node:fs'

const dir = 'docs/sprints/relay-ui-ux-recovery'
const inv = JSON.parse(fs.readFileSync(`${dir}/artifacts/route-inventory.json`, 'utf8'))

const GROUPS = [
  ['home', 'Home / rep workspace'],
  ['sales', 'Sales & prospecting'],
  ['jobs', 'Jobs'],
  ['inbox', 'Inbox'],
  ['work', 'Work / tasks'],
  ['team', 'Team'],
  ['content', 'Content'],
  ['insights', 'Insights'],
  ['settings', 'Settings'],
  ['admin', 'Admin'],
  ['public', 'Public / auth'],
  ['other', 'Other in-shell'],
]

const prefix = (route, p) => route.startsWith(p)
const bucket = (r) => {
  const route = r.route
  if (['/login', '/signup', '/pricing', '/privacy', '/terms', '/security', '/trust', '/acceptable-use', '/ai-policy', '/forgot-password', '/reset-password', '/verify-email'].includes(route) || prefix(route, '/docs')) return 'public'
  if (prefix(route, '/admin')) return 'admin'
  if (prefix(route, '/chats')) return 'inbox'
  if (prefix(route, '/jobs')) return 'jobs'
  if (prefix(route, '/tasks')) return 'work'
  if (prefix(route, '/team') || ['/manage-profiles', '/profiles'].includes(route) || prefix(route, '/profile-intelligence')) return 'team'
  if (prefix(route, '/content') || prefix(route, '/studio')) return 'content'
  if (prefix(route, '/reports') || route === '/performance') return 'insights'
  if (['/settings', '/notifications', '/account', '/accountability'].includes(route)) return 'settings'
  if (['/dashboard', '/home', '/activate', '/onboarding', '/inbox-fixture', '/qa-v4'].includes(route)) return 'home'
  if (prefix(route, '/leads') || prefix(route, '/prospect') || prefix(route, '/accounts') || prefix(route, '/upwork') || prefix(route, '/revenue/email') || route === '/archive') return 'sales'
  return 'other'
}

const by = {}
for (const row of inv.routes) (by[bucket(row)] ??= []).push(row)

const lines = []
lines.push('# Complete UI inventory')
lines.push('')
lines.push(`Generated from \`src/app/**/page.tsx\` at base SHA \`5bcb0f9d\`. ${inv.count} pages.`)
lines.push('Machine-readable: `artifacts/route-inventory.json`.')
lines.push('')
lines.push('Classification key: **Fixture** = deterministic, browser-verified; **Guarded** = explicit server guard found; **Auth-gated** = no page-level guard (layout-level auth); **UX issue** = defect recorded in the register.')
lines.push('')
for (const [key, label] of GROUPS) {
  const rows = by[key] ?? []
  if (!rows.length) continue
  lines.push(`## ${label} (${rows.length})`)
  lines.push('')
  lines.push('| Route | Server guard | Classification |')
  lines.push('|---|---|---|')
  for (const row of rows.sort((a, b) => a.route.localeCompare(b.route))) {
    const classification =
      row.route === '/inbox-fixture'
        ? 'Fixture · browser-verified'
        : row.guards === 'public/none'
          ? 'Auth-gated'
          : `Guarded: ${row.guards}`
    lines.push(`| \`${row.route}\` | \`${row.guards}\` | ${classification} |`)
  }
  lines.push('')
}
lines.push(`Remainder: ${(by.other ?? []).map((r) => `\`${r.route}\``).join(', ') || 'none'}.`)
lines.push('')

fs.writeFileSync(`${dir}/01-COMPLETE-UI-INVENTORY.md`, lines.join('\n'))
console.log('wrote 01-COMPLETE-UI-INVENTORY.md with', inv.count, 'routes')
