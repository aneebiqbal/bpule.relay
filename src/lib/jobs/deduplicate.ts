/**
 * Find Jobs — deduplication.
 *
 * The same role is routinely syndicated across multiple providers. We use
 * several independent signals and only merge when more than one agrees, so
 * two genuinely different jobs are never collapsed.
 *
 * Signals:
 *   1. source + sourceJobId (exact)
 *   2. normalized application URL
 *   3. normalized company + title + location
 *   4. company + title (when both are long enough and unique-bounded)
 *
 * When duplicates are found, the "primary" job keeps the fullest data and
 * the extra sources are recorded on `alsoListedOn`.
 */

import type { Job } from './types'

export interface DedupeStats {
  input: number
  output: number
  removed: number
}

export function deduplicateJobs(jobs: Job[]): { jobs: Job[]; stats: DedupeStats } {
  const seenBySourceId = new Set<string>()
  const seenByUrl = new Map<string, string>()
  const seenBySignature = new Map<string, string>()
  const byId = new Map<string, Job>()

  let removed = 0

  for (const job of jobs) {
    const sourceKey = `${job.source}:${job.sourceJobId}`
    if (seenBySourceId.has(sourceKey)) {
      removed++
      continue
    }

    const urlKey = normalizeApplyUrl(job.applyUrl)
    let duplicateId: string | undefined = urlKey
      ? seenByUrl.get(urlKey)
      : undefined

    if (!duplicateId) {
      const sig = signature(job)
      if (sig) duplicateId = seenBySignature.get(sig)
    }

    if (!duplicateId && titleOnlySignature(job)) {
      const sig = titleOnlySignature(job)!
      duplicateId = seenBySignature.get(sig)
    }

    if (duplicateId && byId.has(duplicateId)) {
      const primary = byId.get(duplicateId)!
      if (primary !== job) removed++
      mergeInto(primary, job)
      continue
    }

    seenBySourceId.add(sourceKey)
    if (urlKey) seenByUrl.set(urlKey, job.id)
    if (signature(job)) seenBySignature.set(signature(job)!, job.id)
    if (titleOnlySignature(job)) {
      const sig = titleOnlySignature(job)!
      if (!seenBySignature.has(sig)) seenBySignature.set(sig, job.id)
    }
    byId.set(job.id, job)
  }

  return { jobs: Array.from(byId.values()), stats: { input: jobs.length, output: byId.size, removed } }
}

function mergeInto(primary: Job, extra: Job): void {
  const seenSources = new Set(primary.alsoListedOn ?? [primary.source])
  if (extra.source !== primary.source) seenSources.add(extra.source)
  const alsoListedOn = Array.from(seenSources)

  // Keep the fullest salary, and the longer description for detail views.
  if (!primary.salary && extra.salary) primary.salary = extra.salary
  if (!primary.companyLogo && extra.companyLogo) primary.companyLogo = extra.companyLogo
  if ((primary.description ?? '').length < (extra.description ?? '').length) {
    primary.description = extra.description
    primary.excerpt = extra.excerpt ?? primary.excerpt
  }
  if (!primary.postedAt && extra.postedAt) primary.postedAt = extra.postedAt
  if (!primary.skills || primary.skills.length === 0) primary.skills = extra.skills
  if (extra.categories && (!primary.categories || primary.categories.length === 0)) {
    primary.categories = extra.categories
  }
  primary.alsoListedOn = alsoListedOn
}

/** Removes tracking params and normalizes scheme/host/path for URL comparison. */
function normalizeApplyUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
    // Strip common tracking parameters.
    const cleaned = new URL(url)
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source', 'src', 'gh_src', 'mc_cid', 'mc_eid']) {
      cleaned.searchParams.delete(key)
    }
    return `${host}${cleaned.pathname}${cleaned.search}`.replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function signature(job: Job): string | undefined {
  const parts = [normalize(job.company), normalize(job.title)]
  if (parts.some((p) => !p || p.length < 3)) return undefined
  const location = normalize(job.location)
  if (location) {
    return ['ct|', ...parts, location].join('|').toLowerCase()
  }
  return ['ct|', ...parts].join('|').toLowerCase()
}

function titleOnlySignature(job: Job): string | undefined {
  const title = normalize(job.title)
  const company = normalize(job.company)
  if (title.length < 8 || company.length < 3) return undefined
  return ['ctt|', company, title].join('|').toLowerCase()
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}