/** Archive the test/demo leads via the canonical app API (soft delete). */
import { chromium } from 'playwright'

const base = 'https://localhost:3000'
const LEADS = [
  'ae491eaf-0fbc-45ae-8a49-f6508ba615d9',
  '7e76ac89-1afb-416d-8ccd-ea0fe1f60d24',
  '3ac01dc3-3d11-409a-b38b-255324fc0cba',
  '9ec437be-61e2-4214-90dd-bd934a2bd8be',
  '1ad9d7a4-7676-4762-82c3-c344c72023d0',
  '3337dd28-60fd-481d-8095-b5bd4e51bd6a',
  'b85485f1-f4a7-4bd4-8c05-6a46bec17090',
  '7e0fe8f6-6a50-44e8-a8fd-c6a8d8076cf3',
  '37248a56-8ed3-401e-8812-d49293f644a2',
  '1dc65b9a-2dae-42c1-8a6b-14da572da183',
]

const browser = await chromium.launch()
const context = await browser.newContext({ ignoreHTTPSErrors: true })
const page = await context.newPage()

await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill('hassan@scout.dev')
await page.locator('input[type="password"], input[name="password"]').first().fill('scout-dev-password')
await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 30_000 })
await page.waitForTimeout(1500)

let ok = 0
for (const id of LEADS) {
  const res = await context.request.post(`${base}/api/leads/${id}/archive`, {
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ action: 'archive' }),
  })
  const text = await res.text()
  if (res.status() === 200) ok += 1
  console.log(`${res.status()} ${id} ${text.slice(0, 80)}`)
}
console.log(`archived via API: ${ok}/${LEADS.length}`)

// Verify the flag through the app's own lead endpoint.
for (const id of LEADS) {
  const res = await context.request.get(`${base}/api/leads/${id}`)
  const json = await res.json().catch(() => ({}))
  const lead = json.lead ?? json
  console.log(`verify ${id}: status=${res.status()} archived=${lead.archived}`)
}
await browser.close()
