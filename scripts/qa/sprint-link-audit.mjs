/**
 * Sprint QA: internal href audit. Flags hrefs whose route has no page.tsx.
 * Read-only. Run: node scripts/qa/sprint-link-audit.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd(), 'src')
const appRoot = path.join(root, 'app')

// Build the set of real routes from page.tsx files.
const routes = new Set()
;(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name === 'page.tsx') {
      let r = '/' + path.relative(appRoot, full).replace(/page\.tsx$/, '')
      r = r.replace(/\([^)]*\)/g, '').replace(/\[[^\]]+\]/g, '*').replace(/\/{2,}/g, '/').replace(/\/+$/, '')
      routes.add((r || '/').replace(/\/page$/, ''))
      // also register the dynamic pattern segments' literal prefix
    }
  }
})(appRoot)

/** Turn a concrete href into a pattern by replacing uuid-ish/id segments with *. */
function patternize(href) {
  return href
    .split('?')[0]
    .split('/')
    .map((seg) => (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || /^\d+$/.test(seg) ? '*' : seg))
    .join('/')
}

const patterns = new Set([...routes].flatMap((r) => [r, patternize(r)]))

function resolves(href) {
  const clean = href.split('?')[0].split('#')[0]
  if (!clean.startsWith('/')) return true
  if (patterns.has(clean) || patterns.has(patternize(clean))) return true
  // prefix match for dynamic routes registered literally, e.g. /team/* vs /team/123
  const segs = clean.split('/').filter(Boolean)
  for (let i = segs.length; i > 0; i--) {
    if (patterns.has('/' + [...segs.slice(0, i - 1), '*'].join('/'))) return true
  }
  return false
}

const files = []
;(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(tsx?|mts)$/.test(entry.name)) files.push(full)
  }
})(root)

const bad = []
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/(?:href|push|replace|redirect)\s*[=(]\s*[`"'](\/[^`"'\s?]*)[`"']/g)) {
      const href = m[1]
      if (!resolves(href)) bad.push({ file: path.relative(process.cwd(), file), line: i + 1, href })
    }
  })
}

console.log(JSON.stringify({ routes: routes.size, unresolved: bad }, null, 1))
