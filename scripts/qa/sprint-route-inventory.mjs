/**
 * Sprint deliverable: route inventory with the server guard each page uses.
 *
 * Deterministic, read-only. Run: node scripts/qa/sprint-route-inventory.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'src/app')
const pages = []
;(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name === 'page.tsx') pages.push(full)
  }
})(root)

const GUARDS = ['requireAdminOpsContext', 'requireTeamContext', 'requireOpsContext']

const rows = []
for (const file of pages.sort()) {
  const src = fs.readFileSync(file, 'utf8')
  let route = '/' + path.relative(root, file).replace(/page\.tsx$/, '')
  route = route
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]+\]/g, '*')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
  const guards = GUARDS.filter((g) => src.includes(g)).map((g) => g.replace('require', '').replace('Context', ''))
  const redirects = [...src.matchAll(/redirect\((["'`])([^"`']+)\1\)/g)].map((m) => m[2])
  const dynamic = /export const dynamic\s*=\s*["']([^"']+)["']/.exec(src)?.[1] ?? ''
  const fetchCalls = [...src.matchAll(/fetch\(\s*[`"']?(\/api\/[^`"'\s?]+)/g)].map((m) => m[1])
  rows.push({
    route: route || '/',
    file: path.relative(process.cwd(), file),
    guards: guards.length ? guards.join('+') : 'public/none',
    dynamic,
    redirects,
    api: [...new Set(fetchCalls)],
  })
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, routes: rows }, null, 1))
