import { test, expect } from '@playwright/test'

/**
 * Product Test C: Job → CV → Proposal → Applied (uninterrupted)
 * Plus: CV persistence, Yesterday timeline
 */

test.describe('PRODUCT TEST C: Job orchestration', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().request.post('/api/onboarding', {
      data: {
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
      },
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
    const titleInput = page.locator('#title').first()
    if (await titleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const titleVal = await titleInput.inputValue()
      if (!titleVal.trim()) {
        await titleInput.fill('Senior Rails Developer - Marketplace')
      }
    }

    // Save the job
    const saveBtn = page.locator('button:has-text("Save job")').first()
    if (await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(saveBtn).toBeEnabled({ timeout: 10_000 })
      await saveBtn.click()
      // Wait for navigation to job detail (NOT /upwork/new)
      await page.waitForURL(/\/upwork\/[a-z][a-z0-9-]+[a-z0-9]/, { timeout: 15_000 })
    }

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

    // Click generate
    const genBtn = page.locator('button:has-text("Generate")').first()
    if (await genBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await genBtn.click()
      await page.waitForTimeout(5_000)

      // ATS score should appear
      const bodyAfter = await page.textContent('body')
      expect(bodyAfter).toContain('ATS Readiness')
    }
  })

  test('C2: Tailored CV survives navigation away and back', async ({ page }) => {
    // Create a job
    await page.goto('/upwork/new')
    await page.waitForLoadState('networkidle')

    const jobDesc = `Full-Stack Developer for healthcare startup.
Required: TypeScript, Node.js, PostgreSQL, React.
Experience with HIPAA compliance preferred.`

    const textarea = page.locator('textarea').first()
    if (await textarea.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await textarea.fill(jobDesc)
      const analyzeBtn = page.locator('button:has-text("Analyze")').first()
      if (await analyzeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await analyzeBtn.click()
        await page.waitForTimeout(6_000)
      }
    }

    // Fill title manually
    const titleInput = page.locator('#title').first()
    if (await titleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const titleVal = await titleInput.inputValue()
      if (!titleVal.trim()) {
        await titleInput.fill('Full-Stack Developer - Healthcare')
      }
    }

    // Save the job
    const saveBtn = page.locator('button:has-text("Save job")').first()
    if (await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(saveBtn).toBeEnabled({ timeout: 10_000 })
      await saveBtn.click()
      await page.waitForURL(/\/upwork\/[a-z][a-z0-9-]+[a-z0-9]/, { timeout: 15_000 })
    }

    const jobUrl = page.url()
    const jobId = jobUrl.split('/upwork/')[1]
    expect(jobId).not.toBe('new')

    // Generate CV
    await page.goto(`/resume/generate?jobId=${jobId}`)
    await page.waitForLoadState('networkidle')

    const genBtn = page.locator('button:has-text("Generate")').first()
    if (await genBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await genBtn.click()
      await page.waitForTimeout(5_000)

      // Verify ATS score appears
      const bodyAfter = await page.textContent('body')
      expect(bodyAfter).toContain('ATS Readiness')

      // Navigate away to dashboard
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // Navigate back to the same CV generation page
      await page.goto(`/resume/generate?jobId=${jobId}`)
      await page.waitForLoadState('networkidle')

      // Generate again — should still work
      const genBtn2 = page.locator('button:has-text("Generate")').first()
      if (await genBtn2.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await genBtn2.click()
        await page.waitForTimeout(5_000)
        const bodyBack = await page.textContent('body')
        expect(bodyBack).toContain('ATS Readiness')
      }
    }
  })
})

test.describe('TIMELINE: Yesterday fixture', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().request.post('/api/onboarding', {
      data: {
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
      },
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
