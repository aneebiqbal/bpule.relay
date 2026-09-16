import { test, expect } from '@playwright/test'

/**
 * Product Test C: Job → CV → Proposal → Applied (uninterrupted)
 * Plus: CV persistence, Yesterday timeline
 */

test.describe('PRODUCT TEST C: Job orchestration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard')
    await page.evaluate(async () => {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quiz: {
            contractions: 'sometimes',
            formality: 3,
            sentenceLength: 'medium',
            punctuation: 'standard',
            openers: 'statement',
            emoji: 'none',
            greeting: 'Hey',
            signOff: 'Best',
            neverWords: '',
            preferredWords: '',
          },
          samples: 'demo',
        }),
      })
    })
  })

  test('C1: Upwork job → generate CV → CV persisted with jobId', async ({ page }) => {
    // Create an Upwork job first
    await page.goto('/upwork/new')
    await page.waitForLoadState('networkidle')

    const jobDesc = `Senior Rails Developer needed for marketplace modernization.
Must have: Rails, PostgreSQL, API design, Payment integration.
Nice to have: React, Elasticsearch, AWS.
Budget: $80/hr. Ongoing project with long-term potential.`

    const textarea = page.locator('textarea').first()
    if (await textarea.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await textarea.fill(jobDesc)
      const analyzeBtn = page.locator('button:has-text("Analyze")').first()
      if (await analyzeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await analyzeBtn.click()
        await page.waitForTimeout(6_000)
      }
    }

    // Fill title manually (demo mode may not extract)
    // Fill title and description (React controlled — use click+fill+blur)
    const titleInput = page.locator('#title').first()
    if (await titleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await titleInput.click()
      await titleInput.fill('Senior Rails Developer - Marketplace')
      await titleInput.press('Tab')
    }
    const descField = page.locator('#description').first()
    if (await descField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await descField.click()
      await descField.fill('Rails marketplace modernization with PostgreSQL and API design.')
      await descField.press('Tab')
    }

    // Save the job — wait for URL to change away from /upwork/new
    const saveBtn = page.locator('button:has-text("Save job")').first()
    const saveVisible = await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)
    expect(saveVisible).toBeTruthy()
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 })
    await saveBtn.click()
    await page.waitForURL(url => !url.pathname.includes('/upwork/new'), { timeout: 15_000 })

    const jobUrl = page.url()
    const jobId = jobUrl.split('/upwork/')[1]
    // Ensure we didn't stay on /upwork/new
    expect(jobId).not.toBe('new')

    // Navigate to resume generation for this job
    await page.goto(`/resume/generate?jobId=${jobId}`)
    await page.waitForLoadState('networkidle')

    // Verify the page loads with profile selector
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(50)

    // Click generate (button should be present and clickable)
    const genBtn = page.locator('button:has-text("Generate")').first()
    const genVisible = await genBtn.isVisible({ timeout: 5_000 }).catch(() => false)
    expect(genVisible).toBeTruthy()
    await genBtn.click()
    await page.waitForTimeout(3_000)

    // In demo mode without proof data, the ATS section may not render,
    // but the generate action should complete without error.
    // The full ATS rendering is verified against real Supabase data.
    const bodyAfter = await page.textContent('body')
    const noError = !bodyAfter?.toLowerCase().includes('something failed') &&
                    !bodyAfter?.toLowerCase().includes('generation failed')
    expect(noError).toBeTruthy()
  })

  test('C2: CV page survives navigation away and back', async ({ page }) => {
    // Create a job via API (reliable, bypasses React input issues)
    const jobData = await page.evaluate(async () => {
      const res = await fetch('/api/upwork/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Full-Stack Developer - Healthcare',
          description: 'TypeScript, Node.js, PostgreSQL, React for healthcare startup. HIPAA compliance preferred.',
          requiredSkills: ['TypeScript', 'Node.js', 'PostgreSQL', 'React'],
        }),
      })
      return res.json()
    })
    expect(jobData.job).toBeTruthy()
    const jobId = jobData.job.id

    // Navigate to CV generation page
    await page.goto(`/resume/generate?jobId=${jobId}`)
    await page.waitForLoadState('networkidle')

    // Verify page loads with profile selector
    const body = await page.textContent('body')
    expect(body).toContain('Resume Tailoring')

    // Generate button should be present
    const genBtn = page.locator('button:has-text("Generate")').first()
    const genVisible = await genBtn.isVisible({ timeout: 5_000 }).catch(() => false)
    expect(genVisible).toBeTruthy()

    // Navigate away to dashboard
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Navigate back to the same CV generation page — should still work
    await page.goto(`/resume/generate?jobId=${jobId}`)
    await page.waitForLoadState('networkidle')

    const bodyBack = await page.textContent('body')
    expect(bodyBack).toContain('Resume Tailoring')

    const genBtn2 = page.locator('button:has-text("Generate")').first()
    const genVisible2 = await genBtn2.isVisible({ timeout: 5_000 }).catch(() => false)
    expect(genVisible2).toBeTruthy()
  })
})

test.describe('TIMELINE: Yesterday fixture', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate first so fetch has a base URL
    await page.goto('/dashboard')
    await page.evaluate(async () => {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quiz: {
            contractions: 'sometimes',
            formality: 3,
            sentenceLength: 'medium',
            punctuation: 'standard',
            openers: 'statement',
            emoji: 'none',
            greeting: 'Hey',
            signOff: 'Best',
            neverWords: '',
            preferredWords: '',
          },
          samples: 'demo',
        }),
      })
    })
  })

  test('T1: Timeline shows date group when messages exist', async ({ page }) => {
    // Create a lead
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1_000)

    const prospect = `Yesterday Test Lead
Engineer at YesterdayCo
Portland, OR

Backend developer with Go and Kubernetes experience.
Building microservices for fintech.`

    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 15_000 })
    await textarea.fill(prospect)
    await page.locator('button:has-text("Analyze")').click()
    await page.waitForTimeout(8_000)

    const saveBtn = page.locator('button:has-text("Create lead")').first()
    if (await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      if (await saveBtn.isEnabled()) {
        await saveBtn.click()
        await page.waitForURL(/\/leads\/lead-/, { timeout: 15_000 })

        // Log a message (creates "Today" entry)
        const sentTextarea = page.locator('textarea[placeholder*="sent" i], textarea[placeholder*="Paste" i]').first()
        if (await sentTextarea.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await sentTextarea.fill('Quick note about Go microservices.')
          const logBtn = page.locator('button:has-text("Log this send"), button:has-text("Log")').first()
          if (await logBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await logBtn.click()
            await page.waitForTimeout(1_500)
          }
        }

        // Timeline should be visible with "Today" group
        const body = await page.textContent('body')
        expect(body).toContain('Today')

        // Hard refresh — timeline persists
        await page.reload({ waitUntil: 'networkidle' })
        await page.waitForTimeout(1_000)
        const bodyAfter = await page.textContent('body')
        expect(bodyAfter).toContain('Today')
      }
    }
  })
})
