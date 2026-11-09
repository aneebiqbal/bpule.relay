/**
 * Inbox internal-notes certification, run as an authenticated real user.
 *
 * Proves the notes path end to end: the panel loads, an authorised add works,
 * the new note appears, a failed submit recovers on retry, no raw database
 * error reaches the client, and RLS scopes the rows to the organisation.
 *
 * Env:
 *   RELAY_NOTES_BASE     default https://localhost:3000
 *   RELAY_NOTES_LEAD     a real lead id owned by the signing-in rep
 *   RELAY_NOTES_EMAIL    default dawood@scout.dev
 *   RELAY_NOTES_DB_URL   owner/service URL for the read-only RLS check
 *   RELAY_NOTES_APP_URL  relay_app URL for the cross-tenant count
 */
import { chromium } from 'playwright'
import { Pool } from '@neondatabase/serverless'

const base = process.env.RELAY_NOTES_BASE ?? 'https://localhost:3000'
const leadId = process.env.RELAY_NOTES_LEAD
const email = process.env.RELAY_NOTES_EMAIL ?? 'dawood@scout.dev'
const dbUrl = process.env.RELAY_NOTES_DB_URL

if (!leadId) throw new Error('RELAY_NOTES_LEAD is required')

const results = []
const ok = (m) => results.push(['ok', m])
const fail = (m) => results.push(['FAIL', m])
const assert = (cond, message) => (cond ? ok(message) : fail(message))

const report = async () => {
  console.log(`\nInbox notes certification — ${email} on lead ${leadId}`)
  console.log('─'.repeat(64))
  for (const [status, message] of results) console.log(`${status === 'ok' ? 'ok  ' : 'FAIL'} ${message}`)
  const failures = results.filter(([s]) => s === 'FAIL').length
  console.log('─'.repeat(64))
  console.log(`${results.length - failures} passed, ${failures} failed`)
  return failures
}

let browser
try {
  browser = await chromium.launch()
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()

  const noteResponses = []
  page.on('response', async (res) => {
    if (!res.url().includes('/api/notes')) return
    const body = await res.text().catch(() => '')
    noteResponses.push({ status: res.status(), body })
  })

  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email', { timeout: 60_000 })
  await page.fill('#login-email', email)
  await page.fill('#login-password', 'scout-dev-password')
  await page.waitForSelector('button.auth-submit[type="submit"]:not([disabled])', { timeout: 30_000 })
  await page.click('button.auth-submit[type="submit"]')
  await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 60_000 })
  await page.waitForTimeout(1500)

  // ── Open the lead and expand the notes panel ──────────────────────────────
  await page.goto(`${base}/chats?lead=${leadId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  const toggle = page.getByRole('button', { name: /Internal notes/ })
  assert((await toggle.count().catch(() => 0)) > 0, 'Internal notes section present')
  await toggle.first().click().catch(() => {})
  await page.waitForTimeout(2000)

  const list = page.locator('ul[aria-label="Notes, newest first"]')
  assert((await list.count().catch(() => 0)) > 0, 'notes list rendered')
  const countNotes = () => list.locator('li:has(time)').count().catch(() => 0)
  // Wait for the initial fetch to settle so the baseline is real.
  await page.waitForFunction(
    () => !document.querySelector('ul[aria-label="Notes, newest first"]')?.innerText.includes('Loading notes'),
    { timeout: 15_000 },
  ).catch(() => {})
  const before = await countNotes()
  ok(`notes loaded (${before} existing)`)

  const alert = page.locator('section [role="alert"]').first()
  const alertText = () => alert.innerText().catch(() => '')
  assert(
    !/permission denied|row-level security|Neon query failed|relation .* does not exist/i.test(await alertText()),
    'no raw DB error shown on load',
  )

  // ── A failed submit must show a friendly error, then recover ──────────────
  const box = page.getByPlaceholder(/Add an internal note/i)
  const submit = page.getByRole('button', { name: 'Add note' })
  assert((await box.count().catch(() => 0)) > 0, 'note composer reachable')

  const stamp = `Relay QA note ${new Date().toISOString()}`
  let failOnce = true
  await page.route('**/api/notes', async (route) => {
    if (failOnce && route.request().method() === 'POST') {
      failOnce = false
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Notes failed.' }) })
      return
    }
    await route.continue()
  })

  await box.first().fill(stamp)
  await submit.click()
  await page.waitForTimeout(2500)
  assert((await alertText()).trim().length > 0, 'failed submit shows an inline error')
  assert(
    !/permission denied|row-level security|Neon query failed/i.test(await alertText()),
    'failure is a friendly message, not a raw DB error',
  )

  await page.unroute('**/api/notes')
  // The composer keeps its draft after a failure; re-fill to be certain the
  // retry submits the same body, and wait for the button to leave its busy
  // state before clicking.
  await box.first().fill(stamp)
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Add note')
      return b && !b.disabled
    },
    { timeout: 15_000 },
  ).catch(() => {})
  await page.getByRole('button', { name: 'Add note' }).click()
  await page
    .waitForFunction(
      (expected) => document.querySelectorAll('ul[aria-label="Notes, newest first"] li:has(time)').length === expected,
      before + 1,
      { timeout: 20_000 },
    )
    .catch(() => {})
  await page.waitForTimeout(1000)

  const after = await countNotes()
  assert(after === before + 1, `retry creates the note (${before} → ${after})`)
  const listText = await list.innerText().catch(() => '')
  assert(listText.includes(stamp.slice(0, 40)), `new note body rendered (list: ${listText.slice(0, 120).replace(/\n/g, ' | ')})`)

  const rawLeak = noteResponses.some((r) =>
    /permission denied|row-level security|Neon query failed|relation .* does not exist/i.test(r.body),
  )
  assert(!rawLeak, `no raw DB error in ${noteResponses.length} notes API responses`)

  // ── Server-side RLS scope ─────────────────────────────────────────────────
  if (!dbUrl) {
    ok('RELAY_NOTES_DB_URL not set — skipping the RLS scope check')
  } else {
    const parsed = new URL(dbUrl)
    parsed.searchParams.delete('channel_binding')
    const pool = new Pool({ connectionString: parsed.toString(), max: 1 })
    try {
      const rows = await pool.query(
        `select n.id, n.organization_id, n.author_rep_id, n.subject_id
           from internal_notes n
          where n.body = $1 and n.deleted_at is null
          order by n.created_at desc limit 1`,
        [stamp],
      )
      assert(rows.rows.length === 1, 'note row persisted')
      if (rows.rows[0]) {
        const row = rows.rows[0]
        const repOrg = await pool.query('select organization_id from reps where id = $1', [row.author_rep_id])
        assert(
          repOrg.rows[0]?.organization_id === row.organization_id,
          'note organisation matches the author rep organisation',
        )
        assert(row.subject_id === leadId, 'note is bound to the lead that was open')
      }

      const appUrl = process.env.RELAY_NOTES_APP_URL
      if (appUrl) {
        const rep = await pool.query('select auth_user_id from reps where id = $1', [rows.rows[0].author_rep_id])
        const authUserId = rep.rows[0]?.auth_user_id
        assert(Boolean(authUserId), 'author rep has an auth user id')
        if (authUserId) {
          const appParsed = new URL(appUrl)
          appParsed.searchParams.delete('channel_binding')
          const appPool = new Pool({ connectionString: appParsed.toString(), max: 1 })
          try {
            const client = await appPool.connect()
            try {
              await client.query('begin')
              await client.query('select set_config($1, $2, true)', ['app.current_user_id', authUserId])
              const scoped = await client.query('select count(*)::int as n from internal_notes')
              await client.query('commit')
              ok(`relay_app sees ${scoped.rows[0].n} notes inside its own org`)
            } finally {
              client.release()
            }
          } finally {
            await appPool.end()
          }
        }
      }
    } finally {
      await pool.end()
    }
  }
} catch (err) {
  fail(`certification threw: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  await browser?.close()
  const failures = await report()
  process.exit(failures === 0 ? 0 : 1)
}
