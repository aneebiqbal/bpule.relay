import type { DbClient } from '@/lib/db/types'

/**
 * Bounded employer-source verification.
 *
 * A feed listing is only `recently_seen` until its application destination is
 * actually checked. This module checks a small, fresh, high-value slice and
 * promotes live listings to `verified_open`. A failed or ambiguous check never
 * closes a job — only an explicit 404/410 does.
 */

export interface VerifyOptions {
  now?: Date
  limit?: number
  timeoutMs?: number
  concurrency?: number
  fetchFn?: typeof fetch
}

export interface VerifyResult {
  checked: number
  verified: number
  closed: number
  failed: number
}

interface Candidate {
  id: string
  apply_url: string
  evidence: unknown
}

const USER_AGENT = 'RelayJobVerification/1.0 (+https://relay.bpulse.dev)'

function appendEvidence(existing: unknown, entry: Record<string, unknown>): unknown[] {
  const list = Array.isArray(existing) ? [...existing] : []
  list.push(entry)
  return list.slice(-12)
}

async function checkUrl(url: string, timeoutMs: number, fetchFn: typeof fetch): Promise<{ status: number | null; finalUrl: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml,*/*', 'User-Agent': USER_AGENT },
      signal: controller.signal,
      cache: 'no-store',
    })
    // Do not download the whole page; headers are enough to judge liveness.
    await response.body?.cancel().catch(() => undefined)
    return { status: response.status, finalUrl: response.url || url }
  } catch {
    return { status: null, finalUrl: url }
  } finally {
    clearTimeout(timer)
  }
}

export async function verifyPendingJobs(db: DbClient, options: VerifyOptions = {}): Promise<VerifyResult> {
  const now = options.now ?? new Date()
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100)
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 8000, 1000), 20_000)
  const concurrency = Math.min(Math.max(options.concurrency ?? 6, 1), 12)
  const fetchFn = options.fetchFn ?? fetch

  const rows = await db.raw!<Candidate[]>(
    `select j.id, j.apply_url, j.verification_evidence as evidence
     from jobs j
     left join job_inventory_index ii on ii.job_id = j.id
     where j.verification_status = 'recently_seen'
       and j.remote = true
       and j.apply_url is not null
       and (j.last_verified_at is null or j.last_verified_at < ?)
     order by case when ii.feed_bucket = 'eligible_low' then 0 else 1 end,
              coalesce(j.posted_at, j.first_seen_at) desc
     limit ?`,
    [new Date(now.getTime() - 7 * 86_400_000).toISOString(), limit],
  )
  if (rows.error) throw new Error(rows.error.message)

  const candidates = (rows.data ?? []).filter((row) => Boolean(row.apply_url))
  const result: VerifyResult = { checked: 0, verified: 0, closed: 0, failed: 0 }

  for (let index = 0; index < candidates.length; index += concurrency) {
    const batch = candidates.slice(index, index + concurrency)
    const outcomes = await Promise.all(
      batch.map((candidate) => checkUrl(candidate.apply_url, timeoutMs, fetchFn)),
    )
    for (let b = 0; b < batch.length; b++) {
      const candidate = batch[b]
      const outcome = outcomes[b]
      result.checked++

      let status: { verification_status: string; closed_at?: string | null; last_verified_at: string }
      let entry: Record<string, unknown>

      if (outcome.status !== null && outcome.status >= 200 && outcome.status < 400) {
        status = { verification_status: 'verified_open', closed_at: null, last_verified_at: now.toISOString() }
        entry = { at: now.toISOString(), type: 'verified_open', http_status: outcome.status, final_url: outcome.finalUrl }
        result.verified++
      } else if (outcome.status === 404 || outcome.status === 410) {
        status = { verification_status: 'closed', closed_at: now.toISOString(), last_verified_at: now.toISOString() }
        entry = { at: now.toISOString(), type: 'closed', http_status: outcome.status, final_url: outcome.finalUrl }
        result.closed++
      } else if (outcome.status === 403 || outcome.status === 429) {
        // Bot protection: reachable, but we cannot confirm the job is open.
        status = { verification_status: 'verification_blocked', last_verified_at: now.toISOString() }
        entry = { at: now.toISOString(), type: 'verification_blocked', http_status: outcome.status, final_url: outcome.finalUrl }
        result.failed++
      } else {
        // 5xx / timeouts / network: reachable but unconfirmed. Never close.
        status = { verification_status: 'recently_seen', last_verified_at: now.toISOString() }
        entry = { at: now.toISOString(), type: 'check_failed', http_status: outcome.status, final_url: outcome.finalUrl }
        result.failed++
      }

      const evidence = appendEvidence(candidate.evidence, entry)
      const updated = await db.raw!(
        `update jobs
         set verification_status = ?, closed_at = coalesce(?, closed_at),
             last_verified_at = ?, verification_evidence = ?::jsonb, updated_at = ?
         where id = ?`,
        [status.verification_status, status.closed_at ?? null, status.last_verified_at, JSON.stringify(evidence), now.toISOString(), candidate.id],
      )
      if (updated.error) throw new Error(updated.error.message)
    }
  }

  return result
}
