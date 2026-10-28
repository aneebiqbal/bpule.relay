/**
 * Browser acceptance diagnostics (Phase 14).
 *
 * A blank page or a timeout must be diagnosable. This captures console errors,
 * uncaught page errors and failed requests, and prints them when a case fails.
 * It does not change any assertion or mask a failure.
 */
import type { Page, TestInfo } from '@playwright/test'

export interface Diagnostics {
  summary: () => string
}

export function attachDiagnostics(page: Page): Diagnostics {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedRequests: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 240))
  })
  page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error).slice(0, 240)))
  page.on('requestfailed', (request) => {
    failedRequests.push(
      `${request.method()} ${request.url().slice(0, 140)} ${request.failure()?.errorText ?? ''}`.trim(),
    )
  })

  return {
    summary: () =>
      JSON.stringify(
        {
          consoleErrors: consoleErrors.slice(-10),
          pageErrors: pageErrors.slice(-10),
          failedRequests: failedRequests.slice(-10),
        },
        null,
        2,
      ),
  }
}

/** Print diagnostics only for a failed case. */
export function reportDiagnostics(testInfo: TestInfo, diagnostics: Diagnostics): void {
  if (testInfo.status === 'passed' || testInfo.status === 'skipped') return
  console.log(`[browser-diagnostics] ${testInfo.title}\n${diagnostics.summary()}`)
}
