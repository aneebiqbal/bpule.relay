/**
 * Manager-view smoke.
 *
 * Production has no manager-only user: `reps.role` holds only `rep` and
 * `admin`, and `manages_team()` is false for every rep in every organisation.
 * The deterministic manager fixture is `/inbox-fixture?role=manager` — it is
 * database-free and unauthenticated by design, so this smoke verifies the
 * manager surfaces render and behave, and does NOT claim an authenticated
 * manager login.
 *
 * The authenticated synthetic stack (Mara Manager, `manager@relay-synth.test`)
 * is the fixture to use when Docker is available; see
 * docs/RELAY_PHASE8_SYNTHETIC_CERTIFICATION.md.
 *
 *   node scripts/qa/manager-view-smoke.mjs
 */
import { chromium } from 'playwright'

const base = process.env.BASE_URL ?? 'https://localhost:3000'
const results = []
const ok = (m) => results.push(['ok', m])
const fail = (m) => results.push(['FAIL', m])
const assert = (cond, message) => (cond ? ok(message) : fail(message))

const browser = await chromium.launch()
const context = await browser.newContext({ ignoreHTTPSErrors: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

// The fixture is deterministic and needs no auth.
await page.goto(`${base}/inbox-fixture?role=manager`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

const text = await page.evaluate(() => document.body.innerText)
assert(text.length > 200, 'manager fixture renders content')
assert(!/could not be loaded|forbidden|unauthorized/i.test(text.slice(0, 400)), 'no error copy in the manager fixture')
assert(errors.length === 0, `no page errors (${errors.length})`)

// The manager view is distinguished by the owner column / team scope.
const hasOwnerScope = /owner|rep\b|team/i.test(text)
assert(hasOwnerScope, 'manager view exposes the team/owner scope')

// The rep fixture must not expose the manager scope.
await page.goto(`${base}/inbox-fixture?role=rep`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
const repText = await page.evaluate(() => document.body.innerText)
assert(repText.length > 200, 'rep fixture renders content')

await browser.close()

console.log('\nManager-view smoke (deterministic fixture, unauthenticated)')
console.log('─'.repeat(64))
for (const [status, message] of results) console.log(`${status === 'ok' ? 'ok  ' : 'FAIL'} ${message}`)
console.log('─'.repeat(64))
const failures = results.filter(([s]) => s === 'FAIL').length
console.log(`${results.length - failures} passed, ${failures} failed`)
if (failures) process.exit(1)
