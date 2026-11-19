import { describe, expect, it } from 'vitest'
import { ADAPTERS } from '@/lib/job-discovery/adapters'
import type { AdapterContext } from '@/lib/job-discovery/types'

function mockFetch(payload: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', etag: 'W/"test"' },
  })) as typeof fetch
}

const ctx = (fetchFn: typeof fetch, config: Record<string, unknown> = {}, cursor: string | null = null): AdapterContext => ({
  config,
  cursor,
  timeoutMs: 1000,
  fetchFn,
})

describe('job discovery adapters', () => {
  it('normalizes RemoteOK and skips the metadata prefix', async () => {
    const result = await ADAPTERS.remoteok(ctx(mockFetch([
      { legal: true },
      {
        id: '123',
        company: 'Acme',
        position: 'Senior Backend Engineer',
        url: 'https://remoteok.com/remote-jobs/123',
        location: 'Remote',
        description: '<p>Build APIs.</p><script>ignore()</script>',
        date: 1_700_000_000_000,
        tags: ['node', 'postgres'],
        salary: '$100000',
      },
    ])))
    expect(result.jobs).toHaveLength(1)
    const job = result.jobs[0]
    expect(job.sourceId).toBe('remoteok')
    expect(job.sourceJobId).toBe('123')
    expect(job.title).toBe('Senior Backend Engineer')
    expect(job.company).toBe('Acme')
    expect(job.remote).toBe(true)
    expect(job.skills).toEqual(['node', 'postgres'])
    expect(job.description).not.toContain('<p>')
    expect(job.description).not.toContain('ignore()')
    expect(job.postedAt).toBe(new Date(1_700_000_000_000).toISOString())
    expect(job.salaryCurrency).toBe('USD')
    expect(job.salaryMin).toBe(100000)
    expect(result.snapshot.contentHash).toHaveLength(64)
  })

  it('normalizes Remotive and paginates by offset', async () => {
    const payload = {
      jobs: [
        {
          id: 42,
          title: 'React Developer',
          company_name: 'Globex',
          description: '<p>Work on our product.</p>',
          candidate_required_location: 'Remote',
          publication_date: '2026-01-02T03:04:05Z',
          job_type: 'full_time',
          tags: ['react'],
          url: 'https://remotive.com/remote-jobs/42',
        },
      ],
    }
    const first = await ADAPTERS.remotive(ctx(mockFetch(payload), { limit: 100 }, '0'))
    expect(first.jobs[0].sourceJobId).toBe('42')
    expect(first.jobs[0].company).toBe('Globex')
    expect(first.jobs[0].postedAt).toBe('2026-01-02T03:04:05.000Z')
    expect(first.cursor).toBeNull()

    const page = await ADAPTERS.remotive(ctx(mockFetch(payload), { limit: 1 }, '0'))
    expect(page.jobs).toHaveLength(1)
    expect(page.cursor).toBe('1')
  })

  it('normalizes Greenhouse board listings', async () => {
    const result = await ADAPTERS.greenhouse(ctx(mockFetch({
      jobs: [
        {
          id: 77,
          title: 'Platform Engineer',
          location: { name: 'Remote' },
          content: '<p>Own the platform.</p>',
          absolute_url: 'https://boards.greenhouse.io/acme/jobs/77',
          created_at: '2026-02-01T00:00:00.000Z',
        },
      ],
    }), { slug: 'acme', company: 'Acme' }))
    expect(result.jobs[0].sourceId).toBe('greenhouse')
    expect(result.jobs[0].sourceJobId).toBe('77')
    expect(result.jobs[0].company).toBe('Acme')
    expect(result.jobs[0].remote).toBe(true)
    expect(result.jobs[0].applyUrl).toContain('/jobs/77')
  })

  it('normalizes Lever postings and converts millisecond createdAt', async () => {
    const result = await ADAPTERS.lever(ctx(mockFetch([
      {
        id: 'abc',
        text: 'Data Engineer',
        descriptionPlain: 'Build pipelines.',
        categories: { location: 'Remote', commitment: 'Full-time' },
        createdAt: 1_700_000_000000,
        hostedUrl: 'https://jobs.lever.co/acme/abc',
        applyUrl: 'https://jobs.lever.co/acme/abc/apply',
      },
    ]), { slug: 'acme', company: 'Acme' }))
    expect(result.jobs[0].sourceId).toBe('lever')
    expect(result.jobs[0].sourceJobId).toBe('abc')
    expect(result.jobs[0].postedAt).toBe(new Date(1_700_000_000000).toISOString())
    expect(result.jobs[0].applyUrl).toContain('/apply')
  })

  it('normalizes Ashby listings and skips unlisted jobs', async () => {
    const result = await ADAPTERS.ashby(ctx(mockFetch({
      jobs: [
        { id: 'a1', title: 'Designer', location: 'Remote', isListed: true, jobUrl: 'https://jobs.ashbyhq.com/acme/a1' },
        { id: 'a2', title: 'Hidden', location: 'Remote', isListed: false },
      ],
    }), { slug: 'acme', company: 'Acme' }))
    expect(result.jobs).toHaveLength(1)
    expect(result.jobs[0].sourceJobId).toBe('a1')
  })

  it('normalizes SmartRecruiters and follows totalFound pagination', async () => {
    const result = await ADAPTERS.smartrecruiters(ctx(mockFetch({
      totalFound: 2,
      content: [
        {
          id: 'sr1',
          name: 'Support Engineer',
          location: { city: 'Berlin', country: 'DE' },
          releasedDate: '2026-03-01T00:00:00.000Z',
          typeOfEmployment: { label: 'Full-time' },
        },
      ],
    }), { company: 'acme', limit: 1 }, '0'))
    expect(result.jobs[0].sourceId).toBe('smartrecruiters')
    expect(result.jobs[0].locationRaw).toContain('Berlin')
    expect(result.cursor).toBe('1')
  })

  it('normalizes Himalayas and keeps a location-bounded role remote', async () => {
    const result = await ADAPTERS.himalayas(ctx(mockFetch({
      jobs: [{
        guid: 'https://himalayas.app/jobs/1',
        title: 'Backend Engineer',
        companyName: 'Acme',
        description: '<p>Build.</p>',
        locationRestrictions: ['United Kingdom'],
        timezoneRestrictions: [0],
        employmentType: 'Full Time',
        pubDate: 1_700_000_000,
        applicationLink: 'https://himalayas.app/jobs/1',
      }],
      nextCursor: 'next',
    }), { limit: 100 }))
    expect(result.jobs[0].sourceId).toBe('himalayas')
    expect(result.jobs[0].remote).toBe(true)
    expect(result.jobs[0].locationRaw).toContain('United Kingdom')
    expect(result.jobs[0].locationRaw).toContain('UTC+0')
    expect(result.jobs[0].postedAt).toBe(new Date(1_700_000_000_000).toISOString())
    expect(result.cursor).toBe('next')
  })

  it('normalizes Jobicy and keeps a geo-bounded role remote', async () => {
    const result = await ADAPTERS.jobicy(ctx(mockFetch({
      jobs: [{
        id: 163229,
        jobTitle: 'Software Engineer',
        companyName: 'Automox',
        jobDescription: '<p>Build.</p>',
        jobGeo: 'USA',
        jobLevel: 'Senior',
        jobType: ['Full-Time'],
        pubDate: '2026-11-19T09:05:10+00:00',
        url: 'https://jobicy.com/jobs/163229',
      }],
    }), { count: 100, industry: 'engineering' }))
    expect(result.jobs[0].sourceId).toBe('jobicy')
    expect(result.jobs[0].remote).toBe(true)
    expect(result.jobs[0].locationRaw).toBe('USA')
    expect(result.jobs[0].seniority).toBe('senior')
    expect(result.jobs[0].employmentType).toBe('full-time')
  })

  it('throws a typed error when an ATS source is not configured', async () => {
    await expect(ADAPTERS.greenhouse(ctx(mockFetch({}), {}))).rejects.toThrow(/config\.slug/)
  })

  it('rejects non-JSON responses instead of inserting garbage', async () => {
    const fetchFn = (async () => new Response('not json', { status: 200 })) as typeof fetch
    await expect(ADAPTERS.remoteok(ctx(fetchFn))).rejects.toThrow(/Non-JSON/)
  })
})
