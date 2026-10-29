/**
 * Feature audit — crawl every surface as a real user and report what actually
 * renders. Read-only: it never submits a form or writes a row.
 *
 *   BASE_URL=https://bpule-relay.vercel.app AUDIT_EMAIL=hassan@scout.dev \
 *     node scripts/qa/feature-audit.mjs > /tmp/audit.json
 *
 * Env IDs are optional; the dynamic routes are skipped when absent.
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:3102'
const EMAIL = process.env.AUDIT_EMAIL || 'hassan@scout.dev'
const PASSWORD = process.env.AUDIT_PASSWORD || 'scout-dev-password'
const OUT = process.env.AUDIT_OUT || null
const SETTLE_MS = Number(process.env.AUDIT_SETTLE_MS || 1200)

const ID = {
  lead: process.env.AUDIT_LEAD_ID || '',
  job: process.env.AUDIT_JOB_ID || '',
  profile: process.env.AUDIT_PROFILE_ID || '',
  persona: process.env.AUDIT_PERSONA_ID || '',
  rep: process.env.AUDIT_REP_ID || 'aaaaaaaa-0000-0000-0000-000000000003',
  identity: process.env.AUDIT_IDENTITY_ID || '',
}

const ROUTES = (process.env.AUDIT_ROUTES
  ? process.env.AUDIT_ROUTES.split(',').map((p) => p.trim()).filter(Boolean)
  : [
      '/dashboard', '/leads', '/chats', '/prospect', '/content', '/content-v2/growth',
      '/relay', '/relay/persona-daily', '/upwork', '/upwork/new', '/inbound', '/archive',
      '/performance', '/accountability', '/team', '/profile-intelligence', '/profiles',
      '/facts', '/manage-profiles', '/rep/assigned-profiles', '/settings', '/account',
      '/admin', '/admin/command-center', '/admin/accountability', '/admin/activity',
      '/admin/ai-usage', '/admin/dataset', '/admin/growth', '/admin/people', '/admin/qa',
      '/admin/revenue-identities', '/admin/revenue-intelligence', '/admin/scoring-qa',
      '/admin/targets', '/admin/training-data', '/activate', '/leads/new', '/leads/import',
      ID.lead && `/leads/${ID.lead}`,
      ID.job && `/upwork/${ID.job}`,
      ID.profile && `/profile-intelligence/${ID.profile}`,
      ID.persona && `/content/${ID.persona}`,
      ID.persona && `/content/${ID.persona}/identity`,
      ID.persona && `/content/${ID.persona}/library`,
      ID.persona && `/content/${ID.persona}/today`,
      ID.persona && `/content/${ID.persona}/journey`,
      ID.persona && `/content/${ID.persona}/create`,
      '/content/new',
      ID.rep && `/team/${ID.rep}`,
      '/team/eval',
      ID.identity && `/workspace/${ID.identity}`,
      '/studio/post-detail',
    ].filter(Boolean))

const ERROR_TEXT = /something went wrong|application error|internal server error|this page could not be found|unhandled runtime error/i
const MOCK_TEXT = /lorem ipsum|coming soon|mock data|demo data|not implemented|sample data|placeholder data/i

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForFunction(() => {
    const el = document.querySelector('#login-email')
    return Boolean(el && '_valueTracker' in el)
  }, { timeout: 30000 })
  await page.locator('#login-email').pressSequentially(EMAIL, { delay: 3 })
  await page.locator('#login-password').pressSequentially(PASSWORD, { delay: 3 })
  await page.getByRole('button', { name: /sign in with password/i }).click()
  await page.waitForFunction(() => /^\/(dashboard|onboarding)/.test(location.pathname), { timeout: 45000 })
}

async function run() {
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(45000)

  let pageErrors = []
  let consoleErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)) })

  await login(page)
  const results = []

  for (const path of ROUTES) {
    pageErrors = []
    consoleErrors = []
    let status = null
    const onResponse = (r) => {
      if (r.request().resourceType() === 'document' && r.url().includes(path.split('?')[0])) status = r.status()
    }
    page.on('response', onResponse)
    const started = Date.now()
    let navError = null
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(SETTLE_MS)
    } catch (e) {
      navError = String(e).split('\n')[0].slice(0, 160)
    }
    page.off('response', onResponse)

    const info = await page.evaluate(() => {
      const text = document.body.innerText || ''
      return {
        url: location.pathname,
        title: document.title,
        h1: document.querySelector('h1')?.textContent?.trim() ?? null,
        textLength: text.length,
        errorText: text.match(/something went wrong|application error|internal server error|this page could not be found|unhandled runtime error/i)?.[0] ?? null,
        mockText: text.match(/lorem ipsum|coming soon|mock data|demo data|not implemented|sample data|placeholder data/i)?.[0] ?? null,
        snippet: text.split('\n').filter(Boolean).slice(0, 8).join(' | ').slice(0, 220),
      }
    }).catch(() => null)

    results.push({
      path,
      status,
      finalUrl: info?.url ?? null,
      ms: Date.now() - started,
      title: info?.title ?? null,
      h1: info?.h1 ?? null,
      textLength: info?.textLength ?? 0,
      errorText: info?.errorText ?? null,
      mockText: info?.mockText ?? null,
      navError,
      pageErrors: [...new Set(pageErrors)],
      consoleErrors: [...new Set(consoleErrors)].slice(0, 4),
      snippet: info?.snippet ?? null,
    })
    console.error(`${path} -> ${info?.url ?? navError} (${Date.now() - started}ms)`)
  }

  const report = { base: BASE, user: EMAIL, at: new Date().toISOString(), results }
  const json = JSON.stringify(report, null, 2)
  if (OUT) writeFileSync(OUT, json)
  console.log(json)
  await browser.close()
}

run().catch((err) => { console.error(err); process.exit(1) })
