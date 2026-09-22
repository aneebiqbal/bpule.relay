/**
 * Find Jobs — engine tests.
 *
 * Pure units (parsing, dedup, filters, ranking) plus provider-contract tests
 * using injected fetchFn (no real network) and end-to-end runs through the
 * mock providers. Credential-gated sources are exercised via env juggling
 * inside the test process only.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import {
  searchJobs,
  buildCvProfile,
  buildSearchParams,
  deduplicateJobs,
  applyHardFilters,
  scoreJob,
  searchAllProviders,
  sanitizeHtml,
  toPlainText,
  makeJob,
  parseSalary,
  salaryMeetsMinimum,
  annualizedEquivalent,
  formatSalary,
  normalizeLocation,
  detectCountry,
  locationMatches,
  combineScores,
  deriveQuerySet,
  looksLikeJobRole,
  postedAgeDays,
  ProviderFailure,
  JOB_SOURCES,
} from '@/lib/jobs'
import type { ExtractedCv, JobSearchParams, JobSearchParamsInput } from '@/lib/jobs'
import { allProviders, providerFor } from '@/lib/jobs/providers'

const ORIGINAL_ENV: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of Object.keys(process.env)) ORIGINAL_ENV[key] = process.env[key]
  delete process.env.ADZUNA_APP_ID
  delete process.env.ADZUNA_APP_KEY
  delete process.env.THE_MUSE_API_KEY
  delete process.env.USAJOBS_API_KEY
  delete process.env.USAJOBS_USER_AGENT
  delete process.env.JOBS_FAILURE_INJECTION
  delete process.env.JOBS_USE_MOCK_PROVIDERS
})

afterEach(() => {
  for (const key of Object.keys(ORIGINAL_ENV)) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key]
    else process.env[key] = ORIGINAL_ENV[key]
  }
  delete process.env.ADZUNA_APP_ID
  delete process.env.ADZUNA_APP_KEY
  delete process.env.THE_MUSE_API_KEY
  delete process.env.USAJOBS_API_KEY
  delete process.env.USAJOBS_USER_AGENT
  delete process.env.JOBS_FAILURE_INJECTION
  delete process.env.JOBS_USE_MOCK_PROVIDERS
})

function makeTestJob(over: {
  source: 'himalayas' | 'remoteok' | 'jobicy' | 'remotive' | 'adzuna' | 'themuse' | 'usajobs' | 'arbeitnow'
  id: string
  title: string
  company?: string
  locationRaw?: string
  applyUrl?: string
  skills?: string[]
  salary?: Record<string, unknown>
}) {
  return makeJob({
    source: over.source,
    sourceJobId: over.id,
    title: over.title,
    company: over.company ?? 'Acme Inc',
    locationRaw: over.locationRaw ?? 'Remote',
    locationExtra: { remote: true },
    skills: over.skills,
    salaryRaw: over.salary ?? { min: 90000, max: 120000, currency: 'USD' },
    description: '<p>A relevant job description.</p>',
    applyUrl: over.applyUrl ?? `https://acme.example/${over.source}-${over.id}`,
  })!
}

function makeParams(over: Partial<JobSearchParams> = {}): JobSearchParams {
  return {
    query: 'software engineer',
    ...over,
  }
}

describe('salary parsing', () => {
  it('parses k-style USD ranges with a currency', () => {
    const s = parseSalary('$90k - $120k')
    expect(s).not.toBeNull()
    expect(s!.min).toBe(90000)
    expect(s!.max).toBe(120000)
    expect(s!.currency).toBe('USD')
    expect(s!.normalizable).toBe(true)
  })

  it('parses comma-separated annual salaries', () => {
    const s = parseSalary('$90,000-$120,000 per year')
    expect(s!.min).toBe(90000)
    expect(s!.max).toBe(120000)
    expect(annualizedEquivalent(s)).toBe(90000)
  })

  it('detects non-USD currencies', () => {
    const s = parseSalary('€70,000')
    expect(s!.min).toBe(70000)
    expect(s!.currency).toBe('EUR')
  })

  it('normalizes hourly salaries to the original currency units', () => {
    const s = parseSalary('$10/hour')
    expect(s!.min).toBe(10)
    expect(annualizedEquivalent(s)).toBe(19200)
  })

  it('returns null for disclosed-as-unknown values', () => {
    expect(parseSalary('not disclosed')).toBeNull()
    expect(parseSalary('')).toBeNull()
    expect(parseSalary(null)).toBeNull()
    expect(parseSalary(undefined)).toBeNull()
  })

  it('accepts already-structured objects', () => {
    const s = parseSalary({ min: 70000, max: 85000, currency: 'EUR', period: 'year' })
    expect(s!.min).toBe(70000)
    expect(s!.currency).toBe('EUR')
    expect(s!.normalizable).toBe(true)
  })

  it('accepts plain numbers with a fallback currency', () => {
    expect(parseSalary(90000, 'USD')).toMatchObject({ min: 90000, currency: 'USD', normalizable: true })
    expect(parseSalary(90000)!.normalizable).toBe(false)
  })

  it('never invents cross-currency comparisons', () => {
    const usd = parseSalary('$120,000')!
    const eur = parseSalary('€110,000')!
    expect(salaryMeetsMinimum(usd, 100000, 'USD')).toBe(true)
    expect(salaryMeetsMinimum(usd, 150000, 'USD')).toBe(false)
    expect(salaryMeetsMinimum(eur, 100000, 'USD')).toBeNull()
    expect(salaryMeetsMinimum(null, 100000, 'USD')).toBeNull()
    expect(salaryMeetsMinimum(usd, undefined, 'USD')).toBe(true)
  })

  it('formats a human-readable salary label', () => {
    const s = parseSalary('$90k - $120k')!
    expect(formatSalary(s)).toContain('$90k')
    expect(formatSalary(s)).toContain('$120k')
    expect(formatSalary(null)).toBe('Salary not listed')
  })

  it('labels the annual period on formatted ranges', () => {
    const s = parseSalary({ min: 90000, max: 120000, currency: 'USD', period: 'year' })!
    expect(formatSalary(s)).toContain('/ yr')
  })
})

describe('location normalization', () => {
  it('flags remote worldwide locations', () => {
    const loc = normalizeLocation('Remote - Worldwide')
    expect(loc.remote).toBe(true)
    expect(loc.onsite).toBe(false)
    expect(loc.country).toBe('WW')
  })

  it('detects hybrid roles and countries', () => {
    const loc = normalizeLocation('Hybrid (Berlin, Germany)')
    expect(loc.hybrid).toBe(true)
    expect(loc.remote).toBe(false)
    expect(loc.country).toBe('DE')
  })

  it('maps city mentions to country codes', () => {
    expect(normalizeLocation('New York, NY US').country).toBe('US')
    expect(normalizeLocation('London, UK').country).toBe('GB')
    expect(normalizeLocation('Remote in Canada').country).toBe('CA')
    expect(detectCountry('Buenos Aires, Argentina')).toBe('AR')
  })

  it('matches location needles loosely', () => {
    expect(locationMatches('Remote, US', 'US')).toBe(true)
    expect(locationMatches('Berlin, Germany', 'Germany')).toBe(true)
    expect(locationMatches('Berlin, Germany', 'France')).toBe(false)
  })
})

describe('sanitization', () => {
  it('strips scripts, iframes and styles', () => {
    const cleaned = sanitizeHtml(
      '<p>Hello <script>alert(1)</script> world</p><iframe src="https://evil.example"></iframe><style>body{display:none}</style>',
    )
    expect(cleaned).not.toContain('script')
    expect(cleaned).not.toContain('iframe')
    expect(cleaned).not.toContain('style')
    expect(cleaned).not.toContain('alert(1)')
    expect(cleaned).toContain('<p>')
  })

  it('blocks javascript: hrefs and keeps safe links', () => {
    const cleaned = sanitizeHtml('<a href="javascript:alert(1)">bad</a><a href="https://ok.example/x">ok</a>')
    expect(cleaned).not.toContain('javascript:')
    expect(cleaned).toContain('https://ok.example/x')
  })

  it('produces plain text with paragraph breaks preserved', () => {
    const s = toPlainText('<p>First para.</p><p>Second para.</p>')
    expect(s).toContain('First para.')
    expect(s).toContain('Second para.')
    expect(s).not.toContain('<p>')
  })

  it('rejects jobs that lack required fields', () => {
    expect(makeJob({ source: 'remoteok', sourceJobId: 'x', title: 'X', applyUrl: 'not a url' })).toBeNull()
    expect(makeJob({ source: 'remoteok', sourceJobId: 'x', title: '   ', applyUrl: 'https://x.example' })).toBeNull()
  })
})

describe('deduplication', () => {
  it('merges the same title+company across providers into one job', () => {
    const jobs = [
      makeTestJob({ source: 'himalayas', id: 'a', title: 'Senior PHP Developer', company: 'Hyperion Digital' }),
      makeTestJob({ source: 'remoteok', id: 'b', title: 'Senior PHP Developer', company: 'Hyperion Digital', locationRaw: 'Worldwide' }),
      makeTestJob({ source: 'jobicy', id: 'c', title: 'Senior PHP Developer', company: 'Hyperion Digital', locationRaw: 'Europe' }),
    ]
    const { jobs: out, stats } = deduplicateJobs(jobs)
    expect(out).toHaveLength(1)
    expect(stats.removed).toBe(2)
    expect(out[0].alsoListedOn).toContain('remoteok')
    expect(out[0].alsoListedOn).toContain('jobicy')
  })

  it('merges by shared application URL even when titles differ', () => {
    const url = 'https://cloudcanvas.com/careers/devops'
    const jobs = [
      makeTestJob({ source: 'himalayas', id: 'd', title: 'DevOps Engineer', company: 'CloudCanvas', applyUrl: url }),
      makeTestJob({ source: 'themuse', id: 'e', title: 'Infrastructure Engineer', company: 'CloudCanvas', applyUrl: url }),
    ]
    const { jobs: out } = deduplicateJobs(jobs)
    expect(out).toHaveLength(1)
    expect(out[0].alsoListedOn).toContain('themuse')
  })

  it('keeps genuinely distinct jobs separate', () => {
    const jobs = [
      makeTestJob({ source: 'himalayas', id: 'f', title: 'Senior PHP Developer', company: 'Hyperion Digital' }),
      makeTestJob({ source: 'himalayas', id: 'g', title: 'Backend Developer', company: 'Hyperion Digital' }),
      makeTestJob({ source: 'himalayas', id: 'h', title: 'Senior PHP Developer', company: 'Another Co' }),
    ]
    const { jobs: out } = deduplicateJobs(jobs)
    expect(out).toHaveLength(3)
  })
})

describe('hard filters', () => {
  it('removes onsite jobs when remote is required', () => {
    const remote = makeTestJob({ source: 'remoteok', id: 'r1', title: 'Remote Engineer' })
    const onsiteJob = makeTestJob({ source: 'adzuna', id: 'o1', title: 'Onsite Engineer', locationRaw: 'London' })
    onsiteJob.remote = false
    onsiteJob.onsite = true
    const { jobs } = applyHardFilters([remote, onsiteJob], makeParams({ remote: true }))
    expect(jobs.map((j) => j.title)).toEqual(['Remote Engineer'])
  })

  it('drops currency-mismatched or underpaid jobs without killing on guesses', () => {
    const good = parseSalary('$120,000')!
    const low = parseSalary('$70,000')!
    const eur = parseSalary('€100,000')!
    const base = [
      makeTestJob({ source: 'remoteok', id: 's1', title: 'Great Pay Engineer', salary: { min: good.min, max: good.max, currency: 'USD' } }),
      makeTestJob({ source: 'remoteok', id: 's2', title: 'Low Pay Engineer', salary: { min: low.min, max: low.max, currency: 'USD' } }),
      makeTestJob({ source: 'remoteok', id: 's3', title: 'EUR Pay Engineer', salary: { min: eur.min, max: eur.max, currency: 'EUR' } }),
    ]

    const strict = applyHardFilters(base, makeParams({ minimumSalary: 100000, salaryCurrency: 'USD' }))
    expect(strict.jobs.map((j) => j.title)).toEqual(['Great Pay Engineer', 'EUR Pay Engineer'])
  })

  it('removes opposite employment types but keeps unknown', () => {
    const ft = makeTestJob({ source: 'jobicy', id: 't1', title: 'Full Time Engineer' })
    ft.employmentType = 'full-time'
    const pt = makeTestJob({ source: 'jobicy', id: 't2', title: 'Part Time Engineer' })
    pt.employmentType = 'part-time'
    const unknown = makeTestJob({ source: 'jobicy', id: 't3', title: 'Unknown Engineer' })
    unknown.employmentType = undefined
    const { jobs } = applyHardFilters([ft, pt, unknown], makeParams({ employmentType: 'full-time' }))
    expect(jobs.map((j) => j.title)).toEqual(['Full Time Engineer', 'Unknown Engineer'])
  })

  it('removes jobs with no query relevance but keeps primary matches', () => {
    const hits = [
      makeTestJob({ source: 'remoteok', id: 'q1', title: 'Software Engineer', company: 'Any' }),
      makeTestJob({ source: 'remoteok', id: 'q2', title: 'Receptionist', company: 'Any' }),
    ]
    const { jobs } = applyHardFilters(hits, makeParams())
    expect(jobs.map((j) => j.title)).toEqual(['Software Engineer'])
  })
})

describe('CV query generation', () => {
  it('derives role, skills and seniority from a profile headline', () => {
    const cv = buildCvProfile({ headline: 'Senior Software Engineer at Acme' }, ['TypeScript', 'Node.js'])
    expect(cv.primaryRole).toBe('Senior Software Engineer')
    expect(cv.skills).toEqual(['TypeScript', 'Node.js'])
    expect(cv.seniority).toBe('senior')
  })

  it('falls back to a default role when there is no profile', () => {
    const cv = buildCvProfile(null, [])
    expect(cv.primaryRole).toBe('software engineer')
  })

  it('expands equivalent roles for common titles', () => {
    const cv = buildCvProfile({ headline: 'DevOps Engineer' }, [])
    expect(cv.alternativeRoles.length).toBeGreaterThan(0)
  })

  it('prefers an explicit user role in the generated query', () => {
    const cv = buildCvProfile({ headline: 'Software Engineer' }, [])
    const params = buildSearchParams({ role: 'PHP Developer' }, cv)
    expect(params.query).toBe('PHP Developer')
  })
})

describe('deterministic ranking', () => {
  const cv = buildCvProfile({ headline: 'Senior Software Engineer at Acme' }, ['TypeScript', 'React', 'AWS'])

  it('scores matched roles above unrelated ones and stays in [0,100]', () => {
    const good = makeTestJob({
      source: 'remoteok',
      id: 'm1',
      title: 'Senior Software Engineer',
      company: 'Acme',
      skills: ['TypeScript', 'React', 'AWS', 'Kubernetes'],
    })
    const bad = makeTestJob({ source: 'remoteok', id: 'm2', title: 'Bartender', company: 'Acme', skills: [] })

    const goodMatch = scoreJob(good, cv, makeParams())
    const badMatch = scoreJob(bad, cv, makeParams())
    expect(goodMatch.score).toBeGreaterThanOrEqual(0)
    expect(goodMatch.score).toBeLessThanOrEqual(100)
    expect(goodMatch.score).toBeGreaterThan(badMatch.score)
  })

  it('reports matched skills and a transparent breakdown', () => {
    const job = makeTestJob({
      source: 'himalayas',
      id: 'm3',
      title: 'Software Engineer',
      skills: ['TypeScript', 'React', 'NotInCv'],
    })
    const match = scoreJob(job, cv, makeParams())
    expect(match.matchedSkills).toContain('TypeScript')
    expect(match.matchedSkills.includes('React')).toBe(true)
    expect(match.breakdown).toMatchObject({ role: expect.any(Number), skills: expect.any(Number) })
    expect(match.summary).toContain('fit')
  })
})

describe('AI blend helper', () => {
  it('keeps the deterministic score when no AI score exists', () => {
    expect(combineScores(80, undefined)).toBe(80)
    expect(combineScores(80, 90)).toBe(84)
    expect(combineScores(100, 100)).toBe(100)
  })
})

describe('provider aggregation and isolation', () => {
  const params = makeParams({ query: 'Software Engineer' })

  it('runs every provider and reports per-source health in mock mode', async () => {
    const { jobs, sources, totalRaw } = await searchAllProviders(params, { mock: true })
    expect(totalRaw).toBeGreaterThan(0)
    expect(totalRaw).toBe(jobs.length)
    expect(Object.keys(sources).sort()).toEqual([...JOB_SOURCES].sort())
    for (const health of Object.values(sources)) {
      expect(health.status).toBe('success')
      expect(health.mock).toBe(true)
    }
  })

  it('marks unconfigured credential-backed providers and isolates network failures', async () => {
    const failFetch = async () => {
      throw new Error('no network')
    }
    const { sources } = await searchAllProviders(params, { mock: false, fetchFn: failFetch })
    expect(sources.adzuna.status).toBe('not_configured')
    expect(sources.themuse.status).toBe('not_configured')
    expect(sources.usajobs.status).toBe('not_configured')
    for (const source of ['himalayas', 'remoteok', 'jobicy', 'remotive', 'arbeitnow'] as const) {
      expect(sources[source].status).toBe('unavailable')
    }
  })

  it('never fails the whole search when a provider misbehaves', async () => {
    process.env.JOBS_FAILURE_INJECTION = 'himalayas:timeout,remoteok:rate_limited'
    const { sources } = await searchAllProviders(params, { mock: true })
    expect(sources.himalayas.status).toBe('timeout')
    expect(sources.remoteok.status).toBe('rate_limited')
    expect(sources.jobicy.status).toBe('success')
    expect(sources.adzuna.status).toBe('success')
  })
})

describe('provider HTTP contract via injected fetch', () => {
  const params = makeParams({ query: 'Software Engineer' })

  it('fetches additional pages until empty, cap, or repeat and reports pagesFetched', async () => {
    const himalayas = providerFor('himalayas')!
    let page = 0
    const fetchFn: typeof fetch = async () => {
      page++
      const payload = { jobs: [{ guid: `p${page}`, title: `Backend Developer ${page}`, companyName: 'Acme', applicationLink: `https://acme.example/${page}` }] }
      if (page >= 3) payload.jobs = []
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const result = await himalayas.search(params, { fetchFn })
    expect(result.pagesFetched).toBe(3)
    expect(result.jobs).toHaveLength(2)
    expect(page).toBe(3)
  })

  it('stops paginating when a feed-only provider returns the same first listing', async () => {
    const himalayas = providerFor('himalayas')!
    const payload = { jobs: [{ guid: 'dup', title: 'Backend Developer', companyName: 'Acme', applicationLink: 'https://acme.example/dup' }] }
    const fetchFn: typeof fetch = async () =>
      new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
    const result = await himalayas.search(params, { fetchFn })
    // Page 2 repeats page 1's first id -> stop; either way one distinct job.
    expect(result.pagesFetched).toBeGreaterThanOrEqual(2)
    expect(result.jobs).toHaveLength(1)
  })

  it('classifies HTTP status codes as typed failures', async () => {
    const adzuna = allProviders.find((p) => p.meta.id === 'adzuna')!
    await expect(
      adzuna.search(params, { fetchFn: async () => new Response('{}', { status: 401 }) }),
    ).rejects.toMatchObject({ kind: 'unauthorized' })
    await expect(
      adzuna.search(params, { fetchFn: async () => new Response('{}', { status: 429 }) }),
    ).rejects.toMatchObject({ kind: 'rate_limited' })
    await expect(
      adzuna.search(params, { fetchFn: async () => new Response('{}', { status: 503 }) }),
    ).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('classifies non-JSON responses', async () => {
    const remoteok = providerFor('remoteok')!
    await expect(
      remoteok.search(params, {
        fetchFn: async () => new Response('<html>boom</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      }),
    ).rejects.toBeInstanceOf(ProviderFailure)
  })

  it('parses a valid Adzuna payload', async () => {
    const adzuna = allProviders.find((p) => p.meta.id === 'adzuna')!
    const payload = {
      results: [
        {
          id: 'z1',
          title: 'Software Engineer',
          company: { display_name: 'TestCorp' },
          location: { display_name: 'London' },
          salary_min: 60000,
          salary_max: 80000,
          description: '<p>Build software.</p>',
          redirect_url: 'https://adzuna.example/job/z1',
        },
      ],
    }
    const result = await adzuna.search(params, {
      fetchFn: async () => new Response(JSON.stringify(payload), { status: 200 }),
    })
    expect(result.jobs).toHaveLength(1)
    expect(result.jobs[0].company).toBe('TestCorp')
    expect(result.jobs[0].salary?.normalizable).toBe(true)
  })
})

describe('mock providers', () => {
  const params = makeParams({ query: 'Software Engineer' })

  it('parses every provider mock into valid jobs', async () => {
    for (const provider of allProviders) {
      const result = await provider.search(params, { mock: true })
      expect(result.jobs.length).toBeGreaterThan(0)
      expect(result.mock).toBe(true)
      for (const job of result.jobs) {
        expect(job.id).toMatch(/^[a-z]+:/)
        expect(job.title.length).toBeGreaterThan(0)
        expect(job.applyUrl).toMatch(/^https?:\/\//)
      }
    }
  })

  it('provides a registry lookup', () => {
    expect(providerFor('usajobs')).toBeDefined()
    expect(providerFor('nope')).toBeUndefined()
  })
})

describe('end-to-end mock search (dedup + filters + ranking)', () => {
  async function run(input: JobSearchParamsInput = {}) {
    return searchJobs({ aiMatching: false, mock: true, ...input })
  }

  it('returns ranked, deduplicated results with source attribution', async () => {
    const res = await run({ role: 'Software Engineer', skills: ['Kubernetes', 'AWS', 'Terraform'] })
    expect(res.meta.mock).toBe(true)
    expect(res.meta.aiMatchingUsed).toBe(false)
    expect(res.jobs.length).toBeGreaterThan(0)
    expect(res.meta.afterDedupe).toBeLessThanOrEqual(res.meta.totalRaw)
    expect(res.meta.afterFilters).toBeLessThanOrEqual(res.meta.afterDedupe)

    // Ranking must be sorted by score descending.
    for (let i = 1; i < res.jobs.length; i++) {
      expect(res.jobs[i - 1].match.score).toBeGreaterThanOrEqual(res.jobs[i].match.score)
    }

    // Sanitized HTML never leaks through.
    for (const job of res.jobs) {
      expect(job.description).not.toMatch(/<script|<iframe|<style/i)
    }

    // Source health is complete and every raw count adds up.
    const rawCount = Object.values(res.sources).reduce((sum, s) => sum + s.count, 0)
    expect(rawCount).toBe(res.meta.totalRaw)
  })

  it('collapses the CloudCanvas DevOps listing syndicated across six sources', async () => {
    const res = await run({ role: 'Software Engineer', skills: ['Kubernetes', 'AWS', 'Terraform'] })
    const cloud = res.jobs.filter((j) => j.company === 'CloudCanvas')
    expect(cloud).toHaveLength(1)
    expect(cloud[0].alsoListedOn?.length).toBeGreaterThanOrEqual(4)
    expect(cloud[0].alsoListedOn).toContain('usajobs')
    expect(cloud[0].alsoListedOn).toContain('adzuna')
  })

  it('honors remote-only filtering in a full run', async () => {
    const res = await run({ role: 'Software Engineer', skills: ['Kubernetes', 'AWS', 'Terraform'], remote: true, hybrid: false })
    expect(res.jobs.length).toBeGreaterThan(0)
    for (const job of res.jobs) {
      expect(job.remote || job.hybrid).toBe(true)
    }
  })

  it('filters by minimum salary in the requested currency', async () => {
    const res = await run({
      role: 'Software Engineer',
      skills: ['Kubernetes', 'AWS', 'Terraform'],
      minimumSalary: 120000,
      salaryCurrency: 'USD',
    })
    for (const job of res.jobs) {
      if (job.salary?.normalizable && job.salary.currency === 'USD') {
        expect(job.salary.min! >= 120000).toBe(true)
      }
    }
  })
})

describe('freshness ranking', () => {
  const cv = buildCvProfile({ headline: 'Senior Software Engineer at Acme' }, ['TypeScript', 'React', 'AWS'])

  function softwareJob(id: string, postedAt?: string) {
    const job = makeTestJob({
      source: 'himalayas',
      id,
      title: 'Senior Software Engineer',
      company: 'Acme',
      skills: ['TypeScript', 'React', 'AWS'],
    })
    if (postedAt) job.postedAt = postedAt
    return job
  }

  it('boosts recently posted roles over stale ones at equal relevance', () => {
    const recent = softwareJob('fr1', new Date(Date.now() - 2 * 86_400_000).toISOString())
    const stale = softwareJob('fr2', new Date(Date.now() - 36 * 86_400_000).toISOString())
    const freshMatch = scoreJob(recent, cv, makeParams())
    const staleMatch = scoreJob(stale, cv, makeParams())
    expect(freshMatch.breakdown.freshness).toBe(1)
    expect(staleMatch.breakdown.freshness).toBe(0.25)
    expect(freshMatch.score).toBeGreaterThan(staleMatch.score)
    expect(staleMatch.gaps.join(' ')).toContain('Posted a while ago')
  })

  it('keeps an unknown posting date neutral', () => {
    const match = scoreJob(softwareJob('fr3'), cv, makeParams())
    expect(match.breakdown.freshness).toBe(0.5)
  })

  it('computes exact age days for parseable dates', () => {
    const age = postedAgeDays(new Date(Date.now() - 3 * 86_400_000).toISOString())
    expect(age).toBeGreaterThanOrEqual(2.9)
    expect(age).toBeLessThan(3.1)
    expect(postedAgeDays(undefined)).toBe(0)
  })
})

describe('active posting filter (expiry + max age)', () => {
  function software(id: string) {
    return makeTestJob({ source: 'himalayas', id, title: 'Software Engineer' })
  }

  it('drops jobs whose expiry has passed and keeps future expiries', () => {
    const expired = software('fx-expired')
    expired.expiresAt = new Date(Date.now() - 60_000).toISOString()
    const active = software('fx-active')
    active.expiresAt = new Date(Date.now() + 86_400_000).toISOString()
    const { jobs } = applyHardFilters([expired, active], makeParams())
    expect(jobs.map((j) => j.sourceJobId)).toEqual(['fx-active'])
  })

  it('excludes postings older than the default max age but keeps unknown dates', () => {
    const stale = software('fx-stale')
    stale.postedAt = new Date(Date.now() - 120 * 86_400_000).toISOString()
    const fresh = software('fx-fresh')
    fresh.postedAt = new Date(Date.now() - 86_400_000).toISOString()
    const unknown = software('fx-unknown')
    const { jobs } = applyHardFilters([stale, fresh, unknown], makeParams())
    expect(jobs.map((j) => j.sourceJobId)).toEqual(['fx-fresh', 'fx-unknown'])
  })
})

describe('CV-derived query fan-out planning', () => {
  it('orders, dedupes and caps the query set from a CV profile', () => {
    const cv = buildCvProfile({ headline: 'Backend Developer' }, ['Python', 'Django', 'AWS'])
    const set = deriveQuerySet(cv)
    expect(set).toEqual([
      'Backend Developer',
      'software engineer',
      'full stack developer',
      'api developer',
      'node.js developer',
      'Python Developer',
    ])
    expect(new Set(set.map((q) => q.toLowerCase())).size).toBe(set.length)
  })

  it('never fans out beyond the configured cap', () => {
    const cv = buildCvProfile({ headline: 'Backend Developer' }, ['Python', 'Django', 'Node.js', 'Rails', 'GraphQL', 'Go', 'React', 'Flask'])
    expect(deriveQuerySet(cv).length).toBeLessThanOrEqual(8)
  })

  it('seeds realistic skills into profiles that only declare a role', () => {
    const cv = buildCvProfile({ headline: 'DevOps Engineer' }, [])
    expect(cv.skills.length).toBeGreaterThan(0)
    expect(cv.skills).toContain('AWS')
  })

  it('rejects a profile whose headline is a person name, not a role', () => {
    const cv = buildCvProfile({ headline: null, label: 'Fizza, LinkedIn' }, [])
    expect(cv.primaryRole).toBe('software engineer')
    expect(looksLikeJobRole('Fizza, LinkedIn')).toBe(false)
    expect(deriveQuerySet(cv)).toContain('software engineer')
    expect(deriveQuerySet(cv).some((q) => /fizza|linkedin/i.test(q))).toBe(false)
  })

  it('derives a full-stack role from a skill set when there is no headline', () => {
    const cv = buildCvProfile({ headline: null, label: 'Fizza, LinkedIn' }, [
      'React',
      'Next.js',
      'TypeScript',
      'Node.js',
      'Firebase',
      'Rails',
      'GraphQL',
      'AWS',
    ])
    expect(cv.primaryRole).toBe('Full Stack Developer')
  })

  it('still honors an explicit manual role typed by the user', () => {
    const cv = buildCvProfile({ headline: null, label: 'Fizza, LinkedIn' }, ['React', 'Node.js'])
    expect(deriveQuerySet(cv, 'Senior Full Stack Engineer')[0]).toBe('Senior Full Stack Engineer')
  })

  it('skips soft skills when seeding skill combos', () => {
    const cv = buildCvProfile({ headline: 'Product Manager' }, ['Communication', 'Strategy'])
    const set = deriveQuerySet(cv)
    expect(set.some((q) => /communication|strategy/i.test(q))).toBe(false)
  })

  it('lets an explicit role lead the query set', () => {
    const cv = buildCvProfile({ headline: 'Backend Developer' }, ['Python', 'Django', 'AWS'])
    expect(deriveQuerySet(cv, 'PHP Developer')[0]).toBe('PHP Developer')
  })

  it('fans the query set out to credential-free boards only, feed-only boards once', async () => {
    const calls = new Map<string, number>()
    const emptyPayloads: Record<string, unknown> = {
      'himalayas.app': { jobs: [] },
      'remoteok.com': [],
      'jobicy.com': { jobs: [] },
      'remotive.com': { jobs: [] },
      'www.arbeitnow.com': { data: [] },
    }
    const fetchFn: typeof fetch = async (input) => {
      const host = new URL(String(input)).host
      calls.set(host, (calls.get(host) ?? 0) + 1)
      const body = emptyPayloads[host] ?? {}
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const queries = ['backend developer', 'python developer', 'django developer', 'api developer', 'extra one']
    const { sources } = await searchAllProviders(makeParams({ query: 'software engineer' }), {
      mock: false,
      fetchFn,
      queries,
    })
    // Page-based free boards issue one request per query; feed-only boards fetch once.
    for (const host of ['himalayas.app', 'remotive.com', 'www.arbeitnow.com']) {
      expect(calls.get(host)).toBe(5)
    }
    expect(calls.get('remoteok.com')).toBe(1)
    expect(calls.get('jobicy.com')).toBe(1)
    expect([...calls.values()].reduce((sum, n) => sum + n, 0)).toBe(17)
    for (const source of ['himalayas', 'remoteok', 'jobicy', 'remotive', 'arbeitnow'] as const) {
      expect(sources[source].status).toBe('success')
    }
  })

  it('fails one query without dropping the rest of a provider pool', async () => {
    let flipping = true
    const fetchFn: typeof fetch = async () => {
      if (flipping) {
        flipping = false
        throw new Error('ransient network blip')
      }
      return new Response(JSON.stringify({ jobs: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const queries = ['a', 'b', 'c']
    const { sources } = await searchAllProviders(makeParams({ query: 'software engineer' }), {
      mock: false,
      fetchFn,
      queries,
    })
    expect(sources.himalayas.status).toBe('success')
  })

  it('strips generic location preferences before building provider params', () => {
    const cv = buildCvProfile(null, [])
    const params = buildSearchParams({ role: 'Software Engineer', location: 'Remote, Worldwide', remote: true }, cv)
    expect(params.location).toBeUndefined()
    const concrete = buildSearchParams({ role: 'Software Engineer', location: 'Berlin, Germany' }, cv)
    expect(concrete.location).toBe('Berlin, Germany')
  })
})

describe('uploaded CV override in searchJobs', () => {
  const cv: ExtractedCv = {
    role: 'Full Stack Developer',
    seniority: 'senior',
    skills: ['React', 'TypeScript', 'Node.js'],
    technologies: ['React', 'TypeScript'],
    company: 'Acme',
    summary: 'Full Stack Developer at Acme',
    sourceLabel: 'uploaded-cv',
  }

  it('ranks and reports against the uploaded CV', async () => {
    const res = await searchJobs({ aiMatching: false, mock: true }, { cv })
    expect(res.meta.cvUsed?.primaryRole).toBe('Full Stack Developer')
    expect(res.meta.cvUsed?.skills).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Node.js']))
    expect(res.meta.cvUsed?.sourceLabel).toBe('uploaded-cv')
  })

  it('uses the CV role as the top query in mock mode', async () => {
    const res = await searchJobs({ aiMatching: false, mock: true }, { cv })
    expect(res.meta.queriesUsed).toEqual(['Full Stack Developer'])
  })
})

describe('salary display helpers', () => {
  it('labels currency symbols and annual periods on structured salaries', () => {
    const s = parseSalary({ min: 70000, max: 90000, currency: 'EUR', period: 'year' })!
    const label = formatSalary(s)
    expect(label).toContain('€70k')
    expect(label).toContain('€90k')
    expect(label).toContain('/ yr')
  })
})