/** Shared helpers for the QA release scripts. */
import { execFileSync } from 'node:child_process'

/** The current commit, or 'unknown' when git is unavailable. */
export function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

/** GET /api/version against a deployed URL, or null when unreachable. */
export function readApiVersion(url) {
  const target = url || process.env.RELAY_PREVIEW_URL || ''
  if (!target) return null
  try {
    const raw = execFileSync('curl', ['-s', '--max-time', '30', `${target.replace(/\/$/, '')}/api/version`], {
      encoding: 'utf8',
    })
    return JSON.parse(raw)
  } catch {
    return null
  }
}
