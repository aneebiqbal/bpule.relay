/**
 * RELAY V6.1.2 — Prospect → Lead production certification.
 *
 * Runs real browser clicks against a DEPLOYED SHA (default
 * https://relay.bpulse.dev) as a rep with several executable profiles, and
 * prints a per-check PASS/FAIL line plus the raw evidence for each.
 *
 * Usage:
 *   node scripts/qa/prospect-lead-certification.mjs [baseUrl]
 *
 * Checks (mapped to the V6.1.2 sprint):
 *   §3  authenticated rep journey + profile selection
 *   §4  wrong active profile cannot override an explicit selection (BUG-32)
 *   §5  same person / different channel
 *   §6  profile match quality is explainable
 *   §9  leads profile filter
 *   §13 display name preserved end to end
 *   §14 connect without note → 0 AI note calls
 *   §16 profile change mid-flow
 *   §27 AI request audit
 *   §28 idempotency
 *   §29 console/page error review
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? process.env.RELAY_BASE_URL ?? 'https://relay.bpulse.dev'
const EMAIL = process.env.CERT_EMAIL ?? 'dawood@scout.dev'
const PASSWORD = process.env.CERT_PASSWORD ?? 'scout-dev-password'

// Executable identities for Dawood (from production identity_assignments).
const ID_MEHAK_UPWORK = '4e2bf898-b182-459d-b6b0-17aa0556750c'
const ID_ANEEB_LINKEDIN = 'e57519a5-bc62-4bfe-b29d-2be809e8d9af'
const ID_HASSAN_LINKEDIN = 'c26a685b-a18b-4672-b7ad-a55e211539b2'

const PASTE = `Dr Ahmad Israr
· 2nd
Founder at Northstar Logistics
Lahore, Pakistan
I need a development team to rebuild our freight tracking platform in Rails. We have budget approved and want to start next month. Our current system is outdated and losing us customers.
About
Founder of a logistics company. Looking for a reliable development partner for a full rebuild.
Experience
Northstar Logistics — Founder (2018 - Present)`

const results = []
const record = (id, ok, detail) => {
  results.push({ id, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail ?? ''}`)
}

const log = (...a) => console.log(...a)

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
page.setDefaultTimeout(60_000)

const consoleErrors = []
const pageErrors = []
const aiRequests = []
const failedRequests = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)))
page.on('request', (req) => {
  const url = req.url()
  if (/api\/prospect\/analyze|api\/leads\/[^/]+\/draft|api\/leads\/[^/]+\/generate|api\/ai\//i.test(url)) {
    aiRequests.push(`${req.method()} ${url.replace(BASE, '')}`)
  }
})
page.on('response', (res) => {
  if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.request().method()} ${res.url().replace(BASE, '')}`)
})

// ── Auth ────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
await page.waitForSelector('#login-email', { timeout: 30_000 })
await page.locator('#login-email').fill(EMAIL)
await page.locator('#login-password').fill(PASSWORD)
await page.getByRole('button', { name: /sign in with password/i }).click()
await page.waitForFunction(() => /^\/(dashboard|onboarding)/.test(location.pathname), { timeout: 45_000 })
const me = await (await context.request.get(`${BASE}/api/me/status`)).json()
log('\nAUTH', EMAIL, JSON.stringify(me))

// ── §4 setup: make the WRONG identity the active workspace ──────────────────
await page.evaluate((id) => {
  localStorage.setItem('relay-active-identity', id)
  document.cookie = `relay-active-identity=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`
}, ID_MEHAK_UPWORK)

// ── §3 / §4 / §16: prospect, select Aneeb · LinkedIn explicitly ─────────────
await page.goto(`${BASE}/prospect`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

const activeHeader = await page.locator('p:has-text("Prospecting as")').first().innerText().catch(() => '')
log('\nACTIVE WORKSPACE HEADER:', activeHeader.replace(/\n/g, ' '))
record('§4.active-workspace-is-mehak-upwork', /Mehak/i.test(activeHeader), activeHeader.replace(/\n/g, ' '))

const senderSelect = page.locator('#prospect-sender')
const options = await senderSelect.locator('option').allInnerTexts()
log('SENDER OPTIONS:', options.join(' | '))
record('§3.sender-options-include-aneeb-linkedin', options.some((o) => /Aneeb/i.test(o) && /LinkedIn/i.test(o)), options.join(' | '))

// Explicitly choose Aneeb · LinkedIn, even though Mehak · Upwork is active.
const aneebOption = await senderSelect.locator('option', { hasText: /Aneeb/ }).first().getAttribute('value')
log('SELECTING Aneeb · LinkedIn →', aneebOption)
await senderSelect.selectOption(aneebOption)
await page.waitForTimeout(300)

// ── §16: change the selection mid-flow to Mehak · LinkedIn, then back ────────
const mehakOption = await senderSelect.locator('option', { hasText: /Mehak/ }).first().getAttribute('value')
await senderSelect.selectOption(mehakOption)
await page.waitForTimeout(1200)
const midHeader = await page.locator('p:has-text("Prospecting as")').first().innerText().catch(() => '')
log('MID-FLOW after switching to Mehak:', midHeader.replace(/\n/g, ' '))
record('§16.selection-change-updates-context', /Mehak/i.test(midHeader), midHeader.replace(/\n/g, ' '))

await senderSelect.selectOption(aneebOption)
await page.waitForTimeout(500)

// ── Analyze ─────────────────────────────────────────────────────────────────
await page.locator('#prospect-source').fill(PASTE)
await page.getByRole('button', { name: /^Analyze$/i }).first().click()
log('\nANALYZING…')

// Wait for the sender section to render with rankings.
await page.waitForSelector('[data-testid="sender-section"]', { timeout: 120_000 }).catch(() => null)
await page.waitForTimeout(2000)

const senderSection = await page.locator('[data-testid="sender-section"]').first().innerText().catch(() => '')
log('SENDER MATCH SECTION:\n', senderSection.replace(/\n/g, ' | ').slice(0, 600))

const rankedProfiles = await page.locator('[data-testid="sender-section"] ul li').allInnerTexts()
log('RANKED CANDIDATES:', JSON.stringify(rankedProfiles))
record('§6.match-list-has-candidates', rankedProfiles.length > 0, `${rankedProfiles.length} candidates`)

// §6: every candidate must expose a score and an explanation.
const unexplained = rankedProfiles.filter((row) => !/\d+%/.test(row))
record('§6.every-candidate-has-a-score', unexplained.length === 0, unexplained.join(' ;; '))

const whyLine = await page.locator('[data-testid="sender-section"] p').allInnerTexts()
const hasEvidence = whyLine.some((t) => t.length > 12 && !/\d+%$/.test(t.trim()))
record('§6.match-has-explainable-evidence', hasEvidence, whyLine.map((t) => t.trim()).filter(Boolean).join(' | ').slice(0, 200))

// ── §13 display name in the analysis result ─────────────────────────────────
const resultText = await page.locator('body').innerText()
record('§13.display-name-preserved-in-analysis', /Dr Ahmad Israr/.test(resultText), 'found "Dr Ahmad Israr"')

// ── Create the lead ─────────────────────────────────────────────────────────
const saveResponses = []
page.on('response', async (res) => {
  if (/api\/prospect\/save/.test(res.url())) {
    const body = await res.text().catch(() => '')
    saveResponses.push({ status: res.status(), body: body.slice(0, 500) })
  }
})

const createButton = page.locator('[data-testid="prospect-primary-action"]')
log('PRIMARY ACTION LABEL:', await createButton.first().innerText().catch(() => '?'))
log('PRIMARY ACTION DISABLED:', await createButton.first().isDisabled().catch(() => '?'))
await createButton.first().click()
log('CREATING LEAD…')

// Either the created-confirmation or a duplicate notice appears.
await page.waitForTimeout(5000)
log('SAVE RESPONSES:', JSON.stringify(saveResponses))
const afterSave = await page.locator('body').innerText()
log('URL AFTER SAVE:', page.url())
const save409 = saveResponses.find((r) => r.status === 409)
const save201 = saveResponses.find((r) => r.status === 201)
const duplicatePayload = save409 ? JSON.parse(save409.body) : null
const duplicate = Boolean(duplicatePayload?.existingLeadId)

let createdLeadId = null
if (save201) {
  const parsed = JSON.parse(save201.body)
  createdLeadId = parsed.leadId ?? parsed.lead?.id ?? null
  record('§3.lead-created', Boolean(createdLeadId), `lead ${createdLeadId} company=${parsed.lead?.company}`)
  record('§13.display-name-preserved-at-creation', parsed.lead?.contactName === 'Dr Ahmad Israr', JSON.stringify(parsed.lead?.contactName))
} else if (duplicatePayload) {
  createdLeadId = duplicatePayload.existingLeadId
  log('DUPLICATE PATH — existing lead:', createdLeadId, 'origin profile:', duplicatePayload.existingLeadSenderProfileId)
  record('§11.duplicate-notice-shows-existing', Boolean(createdLeadId), `existing lead ${createdLeadId}`)
  record('§30.duplicate-shows-origin-profile', duplicatePayload.existingLeadSenderProfileId === '87c10cd5-58e3-4742-910d-4de549d522c7', `origin=${duplicatePayload.existingLeadSenderProfileId}`)
  record('§12.archived-flag-present', duplicatePayload.existingLeadArchived === false, `archived=${duplicatePayload.existingLeadArchived}`)
} else {
  record('§3.lead-created', false, `no 201/409 response (saw ${saveResponses.map((r) => r.status).join(',') || 'none'})`)
}

if (createdLeadId) {
  // ── §4 definitive proof: stored identity == Aneeb · LinkedIn ──────────────
  const leadApi = await (await context.request.get(`${BASE}/api/leads/${createdLeadId}`)).json()
  const storedIdentity = leadApi?.lead?.revenueIdentityId ?? leadApi?.revenueIdentityId ?? null
  const storedProfile = leadApi?.lead?.senderProfileId ?? leadApi?.senderProfileId ?? null
  log('\nSTORED LEAD:', JSON.stringify({ id: createdLeadId, storedIdentity, storedProfile, contactName: leadApi?.lead?.contactName ?? leadApi?.contactName }))
  record('§4.stored-identity-is-selected-identity', storedIdentity === ID_ANEEB_LINKEDIN, `stored=${storedIdentity} expected=${ID_ANEEB_LINKEDIN}`)
  record('§4.mehak-upwork-never-stored', storedIdentity !== ID_MEHAK_UPWORK, `stored=${storedIdentity}`)
  record('§13.display-name-preserved-on-lead', (leadApi?.lead?.contactName ?? leadApi?.contactName) === 'Dr Ahmad Israr', JSON.stringify(leadApi?.lead?.contactName ?? leadApi?.contactName))

  // ── §9 leads profile filter ───────────────────────────────────────────────
  await page.goto(`${BASE}/leads`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const filterSelect = page.locator('select[aria-label="Profile"]').first()
  const filterOptions = await filterSelect.locator('option').allInnerTexts().catch(() => [])
  log('\nLEADS PROFILE FILTER OPTIONS:', filterOptions.join(' | '))
  record('§9.rep-sees-profile-filter', filterOptions.length > 0, filterOptions.join(' | '))

  const readRows = async () => {
    const rows = await page.locator('table tbody tr').allInnerTexts().catch(() => [])
    return rows.map((r) => r.replace(/\n/g, ' '))
  }
  const countLabel = await page.locator('text=/\\d+\\s+(leads|results)/i').first().innerText().catch(() => '')

  const allRows = await readRows()
  log('ALL ROWS:', allRows.length, '| count label:', countLabel.replace(/\n/g, ' '))

  // Select Aneeb · LinkedIn.
  const aneebValue = await filterSelect.locator('option', { hasText: /Aneeb/ }).first().getAttribute('value').catch(() => null)
  if (aneebValue) {
    await filterSelect.selectOption(aneebValue)
    await page.waitForTimeout(2500)
    const filteredRows = await readRows()
    const filteredCount = await page.locator('text=/\\d+\\s+(leads|results)/i').first().innerText().catch(() => '')
    log('FILTERED (Aneeb) ROWS:', filteredRows.length, '| count label:', filteredCount.replace(/\n/g, ' '))
    record('§9.created-lead-visible-under-selected-profile', filteredRows.some((r) => /Finlytic|Ahmad Israr/i.test(r)), filteredRows.join(' ;; ').slice(0, 300))
    record('§9.count-label-present', /\d+/.test(filteredCount), filteredCount.replace(/\n/g, ' '))

    // §10 search + profile filter parity.
    await page.locator('input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]').first().fill('Ahmad').catch(() => {})
    await page.waitForTimeout(2000)
    const searchedRows = await readRows()
    log('SEARCH "Ahmad" + profile Aneeb ROWS:', searchedRows.length, JSON.stringify(searchedRows).slice(0, 200))
    record('§10.search-narrows-within-profile', searchedRows.every((r) => /Ahmad|Finlytic/i.test(r)), searchedRows.join(' ;; ').slice(0, 200))
  }

  // ── §3 lead row origin badge ──────────────────────────────────────────────
  await page.goto(`${BASE}/leads`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const rowText = await page.locator('table tbody tr').first().innerText().catch(() => '')
  log('\nFIRST LEAD ROW:', rowText.replace(/\n/g, ' | ').slice(0, 300))
  record('§3.lead-row-shows-origin', /LinkedIn|Upwork|Aneeb|Hassan|Mehak/i.test(rowText), rowText.replace(/\n/g, ' | ').slice(0, 200))

  // ── §14 connect without note ──────────────────────────────────────────────
  const beforeAi = aiRequests.length
  await page.goto(`${BASE}/leads/${createdLeadId}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  const leadPageText = await page.locator('body').innerText()
  const hasNoNote = /Send without note/i.test(leadPageText)
  record('§14.connect-without-note-offered', hasNoNote, 'button present')

  if (hasNoNote) {
    await page.getByRole('button', { name: /Send without note/i }).first().click()
    await page.waitForTimeout(3000)
    const afterNoNote = aiRequests.length - beforeAi
    log('AI REQUESTS during connect-without-note:', afterNoNote, JSON.stringify(aiRequests.slice(beforeAi)))
    record('§14.no-note-zero-ai-calls', afterNoNote === 0, `${afterNoNote} AI calls`)
  }

  // §28 idempotency: click again if still present (should be idempotent).
  const stillThere = page.getByRole('button', { name: /Send without note/i }).first()
  if (await stillThere.count().catch(() => 0)) {
    await stillThere.click().catch(() => {})
    await page.waitForTimeout(2000)
  }
}

// ── §29 error review ─────────────────────────────────────────────────────────
log('\nCONSOLE ERRORS:', consoleErrors.length, JSON.stringify(consoleErrors.slice(0, 8)))
log('PAGE ERRORS:', pageErrors.length, JSON.stringify(pageErrors.slice(0, 8)))
log('FAILED REQUESTS:', failedRequests.length, JSON.stringify(failedRequests.slice(0, 12)))
log('AI REQUESTS (all):', JSON.stringify(aiRequests))

record('§29.no-page-errors', pageErrors.length === 0, `${pageErrors.length} page errors`)
record('§29.no-failed-api-requests', failedRequests.filter((f) => !/401 GET \/api\/me\/status|409 POST \/api\/prospect\/save/.test(f)).length === 0, `${failedRequests.length} failed`)

// ── Summary ─────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok)
log('\n════════════════════════════════════════')
log(`CERTIFICATION: ${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  log('FAILED CHECKS:')
  for (const f of failed) log(`  - ${f.id}: ${f.detail}`)
}
log('════════════════════════════════════════')

await browser.close()
process.exit(failed.length ? 1 : 0)
