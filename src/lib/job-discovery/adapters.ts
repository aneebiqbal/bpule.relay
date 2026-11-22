/**
 * Job Intelligence v2 — permitted source adapters.
 *
 * Every adapter is a public JSON/API board read. No session scraping, no
 * CAPTCHA circumvention, no stealth automation. Sources that require a
 * partner key or prohibit automation (LinkedIn jobs, Workday, Indeed) are
 * deliberately absent; LinkedIn import is human-assisted and manual.
 *
 * Parsers are deliberately tolerant: a board changing an optional field must
 * degrade to a shorter record, not fail the whole run.
 */

import { createHash } from 'node:crypto'
import type {
  AdapterContext,
  AdapterOutput,
  DiscoveryJob,
  SourceAdapter,
  SourceSnapshot,
} from './types'

const USER_AGENT = 'RelayJobDiscovery/2.0 (+https://relay.bpulse.dev; contact@bpulse.dev)'

async function fetchJson(
  url: string,
  ctx: AdapterContext,
): Promise<{ json: unknown; snapshot: Omit<SourceSnapshot, 'url' | 'contentHash'>; contentHash: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs)
  try {
    const response = await ctx.fetchFn(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
      cache: 'no-store',
    })
    const body = await response.text()
    const contentHash = createHash('sha256').update(body).digest('hex')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`)
    }
    let json: unknown
    try {
      json = JSON.parse(body)
    } catch {
      throw new Error(`Non-JSON response from ${url}`)
    }
    return {
      json,
      contentHash,
      snapshot: {
        httpStatus: response.status,
        etag: response.headers.get('etag') ?? undefined,
        lastModified: response.headers.get('last-modified') ?? undefined,
      },
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Timed out after ${ctx.timeoutMs}ms for ${url}`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// Some feeds serve UTF-8 bytes that were decoded as Latin-1 (double-encoded).
// Repair the classic signature (C1 continuation bytes) without touching
// already-correct text or ASCII identifiers.
export function repairEncoding(value: string): string {
  if (!value || !/[\u0080-\u009F]/.test(value)) return value
  try {
    const repaired = Buffer.from(value, 'latin1').toString('utf8')
    return repaired.includes('\uFFFD') ? value : repaired
  } catch {
    return value
  }
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = repairEncoding(value.trim())
    return trimmed ? trimmed : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === 'true'
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&hellip;/gi, '…')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function text(value: unknown): string {
  if (typeof value !== 'string') return ''
  return repairEncoding(stripHtml(value))
}

function parseDate(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Lever uses milliseconds; some feeds use seconds.
    const ms = value > 10_000_000_000 ? value : value * 1000
    const date = new Date(ms)
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
  }
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
  }
  return undefined
}

function parseMoney(value: unknown): {
  min?: number
  max?: number
  currency?: string
  period?: string
  raw?: string
} {
  const raw = str(value)
  if (!raw) return {}
  const numbers = raw.match(/\d[\d,]*(?:\.\d+)?/g)?.map((n) => Number(n.replace(/,/g, ''))) ?? []
  const code = raw.match(/\b(USD|EUR|GBP|CAD|AUD|INR|PKR|JPY|CHF|SEK|NOK|DKK)\b/)?.[1]
  const symbol = raw.match(/[$€£]/)?.[0]
  const currency = code ?? (symbol ? ({ '$': 'USD', '€': 'EUR', '£': 'GBP' } as Record<string, string>)[symbol] : undefined)
  const period = /\b(hour|hr|hourly)\b/i.test(raw)
    ? 'hour'
    : /\b(day|daily)\b/i.test(raw)
      ? 'day'
      : /\b(week|weekly)\b/i.test(raw)
        ? 'week'
        : /\b(month|monthly)\b/i.test(raw)
          ? 'month'
          : /\b(year(?:ly)?|annual(?:ly)?|yr)\b/i.test(raw)
            ? 'year'
            : undefined
  return {
    min: numbers[0],
    max: numbers[1] ?? numbers[0],
    currency,
    period,
    raw,
  }
}

function salaryFields(value: unknown): {
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  salaryPeriod?: string
  salaryRaw?: string
} {
  const money = parseMoney(value)
  return {
    salaryMin: money.min,
    salaryMax: money.max,
    salaryCurrency: money.currency,
    salaryPeriod: money.period,
    salaryRaw: money.raw,
  }
}

const TECH_PATTERNS: Array<[RegExp, string]> = [
  [/\breact\b/i, 'React'], [/\btypescript\b/i, 'TypeScript'], [/\bjavascript\b/i, 'JavaScript'],
  [/\bnode\.?js\b/i, 'Node.js'], [/\brails\b/i, 'Rails'], [/\bruby on rails\b/i, 'Ruby on Rails'],
  [/\bpython\b/i, 'Python'], [/\bdjango\b/i, 'Django'], [/\bflask\b/i, 'Flask'],
  [/\bpostgres(?:ql)?\b/i, 'PostgreSQL'], [/\bmysql\b/i, 'MySQL'], [/\bgraphql\b/i, 'GraphQL'],
  [/\baws\b/i, 'AWS'], [/\bgcp\b/i, 'GCP'], [/\bazure\b/i, 'Azure'], [/\bdocker\b/i, 'Docker'],
  [/\bkubernetes\b/i, 'Kubernetes'], [/\bterraform\b/i, 'Terraform'], [/\bnext\.?js\b/i, 'Next.js'],
  [/\bvue\b/i, 'Vue'], [/\bangular\b/i, 'Angular'], [/\bjava\b/i, 'Java'], [/\brust\b/i, 'Rust'],
  [/\bc#\b/i, 'C#'], [/\b\.net\b/i, '.NET'], [/\bswift\b/i, 'Swift'], [/\bkotlin\b/i, 'Kotlin'],
  [/\bflutter\b/i, 'Flutter'], [/\breact native\b/i, 'React Native'], [/\btailwind\b/i, 'Tailwind'],
  [/\bcss\b/i, 'CSS'], [/\bhtml\b/i, 'HTML'], [/\bredis\b/i, 'Redis'], [/\bkafka\b/i, 'Kafka'],
  [/\belasticsearch\b/i, 'Elasticsearch'], [/\bmongodb\b/i, 'MongoDB'], [/\bsql\b/i, 'SQL'],
  [/\bci\/cd\b/i, 'CI/CD'], [/\blinux\b/i, 'Linux'], [/\bfigma\b/i, 'Figma'], [/\bjest\b/i, 'Jest'],
  [/\bcypress\b/i, 'Cypress'], [/\bplaywright\b/i, 'Playwright'], [/\bprisma\b/i, 'Prisma'],
  [/\bsupabase\b/i, 'Supabase'], [/\bfirebase\b/i, 'Firebase'], [/\bvercel\b/i, 'Vercel'],
  [/\bstripe\b/i, 'Stripe'], [/\bauth0\b/i, 'Auth0'], [/\boauth\b/i, 'OAuth'], [/\bjwt\b/i, 'JWT'],
  [/\bmicroservices\b/i, 'Microservices'], [/\bserverless\b/i, 'Serverless'], [/\blambda\b/i, 'Lambda'],
  [/\bs3\b/i, 'S3'], [/\bbigquery\b/i, 'BigQuery'], [/\bsnowflake\b/i, 'Snowflake'], [/\bdbt\b/i, 'dbt'],
  [/\bairflow\b/i, 'Airflow'], [/\bspark\b/i, 'Spark'], [/\bmachine learning\b/i, 'Machine Learning'],
  [/\btensorflow\b/i, 'TensorFlow'], [/\bpytorch\b/i, 'PyTorch'], [/\bpandas\b/i, 'Pandas'],
  [/\bnumpy\b/i, 'NumPy'], [/\bopenai\b/i, 'OpenAI'], [/\bllm\b/i, 'LLM'], [/\brag\b/i, 'RAG'],
]

/** Extract technologies a posting actually names; used when a board has no tags. */
function extractSkills(text: string): string[] {
  const found = new Set<string>()
  for (const [pattern, label] of TECH_PATTERNS) if (pattern.test(text)) found.add(label)
  return [...found]
}

function skills(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).map((v) => v.trim()))].slice(0, 40)
  }
  if (typeof value === 'string' && value.trim()) {
    return [...new Set(value.split(/[,;•|]/).map((s) => s.trim()).filter(Boolean))].slice(0, 40)
  }
  return []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Bounded-concurrency map; one slow detail must not fail the whole board. */
async function withConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (index < items.length) {
      const item = items[index++]
      try {
        await fn(item)
      } catch {
        // A single detail failure leaves the listing as-is.
      }
    }
  })
  await Promise.all(workers)
}

function isRemoteText(...values: unknown[]): boolean {
  return values.some((value) => typeof value === 'string' && /\bremote\b|\bwork from home\b|\bwfh\b/i.test(value))
}

function configString(config: Record<string, unknown>, key: string): string {
  return str(config[key]) ?? ''
}

function excerpt(description: string, max = 280): string {
  const clean = description.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

function output(
  jobs: DiscoveryJob[],
  snapshot: Omit<SourceSnapshot, 'url' | 'contentHash'>,
  url: string,
  contentHash: string,
  cursor: string | null,
): AdapterOutput {
  return { jobs, cursor, snapshot: { ...snapshot, url, contentHash } }
}

// ── RemoteOK ────────────────────────────────────────────────────────────────
const remoteok: SourceAdapter = async (ctx) => {
  const url = 'https://remoteok.com/api'
  const { json, snapshot, contentHash } = await fetchJson(url, ctx)
  const rows = asArray(json)
  const jobs: DiscoveryJob[] = []
  for (const row of rows) {
    const item = asRecord(row)
    // RemoteOK prefixes the array with a metadata object.
    const id = str(item.id)
    const title = str(item.position) ?? str(item.title)
    if (!id || !title) continue
    const description = text(item.description)
    const location = str(item.location)
    jobs.push({
      sourceId: 'remoteok',
      sourceJobId: id,
      title,
      company: str(item.company) ?? 'Unknown company',
      companyLogo: str(item.company_logo) ?? str(item.companyLogo),
      locationRaw: location ?? 'Remote',
      remote: true,
      employmentType: str(item.job_type),
      ...salaryFields(item.salary ?? item.salary_avg),
      description,
      excerpt: excerpt(description),
      skills: skills(item.tags),
      postedAt: parseDate(item.date),
      applyUrl: str(item.url),
      sourceUrl: str(item.url),
      attribution: { required: false, label: 'RemoteOK', url: 'https://remoteok.com' },
      raw: item,
    })
  }
  return output(jobs, snapshot, url, contentHash, null)
}

// ── Remotive ────────────────────────────────────────────────────────────────
const remotive: SourceAdapter = async (ctx) => {
  const limit = Number(configString(ctx.config, 'limit') || 100)
  const offset = Number(ctx.cursor ?? 0) || 0
  const url = `https://remotive.com/api/remote-jobs?limit=${limit}&offset=${offset}`
  const { json, snapshot, contentHash } = await fetchJson(url, ctx)
  const rows = asArray(asRecord(json).jobs)
  const jobs: DiscoveryJob[] = []
  for (const row of rows) {
    const item = asRecord(row)
    const id = str(item.id)
    const title = str(item.title)
    if (!id || !title) continue
    const description = text(item.description)
    const location = str(item.candidate_required_location) ?? str(item.location) ?? 'Remote'
    jobs.push({
      sourceId: 'remotive',
      sourceJobId: id,
      title,
      company: str(item.company_name) ?? 'Unknown company',
      companyLogo: str(item.company_logo) ?? str(item.companyLogo),
      locationRaw: location,
      remote: true,
      employmentType: str(item.job_type),
      ...salaryFields(item.salary),
      description,
      excerpt: excerpt(description),
      skills: skills(item.tags),
      postedAt: parseDate(item.publication_date ?? item.pubDate),
      applyUrl: str(item.url),
      sourceUrl: str(item.url),
      attribution: { required: false, label: 'Remotive', url: 'https://remotive.com' },
      raw: item,
    })
  }
  const nextOffset = offset + jobs.length
  const cursor = jobs.length >= limit ? String(nextOffset) : null
  return output(jobs, snapshot, url, contentHash, cursor)
}

// ── Greenhouse ──────────────────────────────────────────────────────────────
const greenhouse: SourceAdapter = async (ctx) => {
  const slug = configString(ctx.config, 'slug')
  if (!slug) throw new Error('Greenhouse source needs config.slug')
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`
  const { json, snapshot, contentHash } = await fetchJson(url, ctx)
  const rows = asArray(asRecord(json).jobs)
  const company = configString(ctx.config, 'company') || slug
  const jobs: DiscoveryJob[] = []
  for (const row of rows) {
    const item = asRecord(row)
    const id = str(item.id)
    const title = str(item.title)
    if (!id || !title) continue
    const description = text(item.content)
    const location = str(asRecord(item.location).name) ?? str(item.location)
    jobs.push({
      sourceId: 'greenhouse',
      sourceJobId: id,
      title,
      company,
      companyLogo: str(item.company_logo) ?? str(asRecord(item.company).logo),
      locationRaw: location,
      remote: isRemoteText(location, description),
      employmentType: (str(item.metadata) ?? '').includes('full-time') ? 'full-time' : undefined,
      description,
      excerpt: excerpt(description),
      skills: skills(item.tags).length > 0 ? skills(item.tags) : extractSkills(description),
      postedAt: parseDate(item.created_at),
      expiresAt: parseDate(item.expires_at),
      applyUrl: str(item.absolute_url),
      sourceUrl: str(item.absolute_url),
      attribution: { required: false, label: 'Greenhouse', url: `https://boards.greenhouse.io/${slug}` },
      raw: item,
    })
  }
  // The list endpoint omits the job body. Fetch details for the most recent
  // listings, bounded per run so a large board cannot starve the timer.
  const detailLimit = Number(configString(ctx.config, 'detail_limit') || 50)
  const toFetch = jobs
    .filter((job) => !job.description)
    .sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
    .slice(0, detailLimit)
  await withConcurrency(toFetch, 4, async (job) => {
    const detailUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(job.sourceJobId)}`
    const { json } = await fetchJson(detailUrl, ctx)
    const detail = asRecord(json)
    const content = text(detail.content)
    if (content) {
      job.description = content
      job.excerpt = excerpt(content)
      if (job.skills.length === 0) job.skills = extractSkills(content)
    }
    const absolute = str(detail.absolute_url)
    if (absolute) job.applyUrl = absolute
    const firstPublished = parseDate(detail.created_at ?? detail.first_published)
    if (firstPublished) job.postedAt = firstPublished
  })
  return output(jobs, snapshot, url, contentHash, null)
}

// ── Lever ───────────────────────────────────────────────────────────────────
const lever: SourceAdapter = async (ctx) => {
  const slug = configString(ctx.config, 'slug')
  if (!slug) throw new Error('Lever source needs config.slug')
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`
  const { json, snapshot, contentHash } = await fetchJson(url, ctx)
  const rows = asArray(json)
  const company = configString(ctx.config, 'company') || slug
  const jobs: DiscoveryJob[] = []
  for (const row of rows) {
    const item = asRecord(row)
    const id = str(item.id)
    const title = str(item.text)
    if (!id || !title) continue
    const categories = asRecord(item.categories)
    const description = text(item.descriptionPlain ?? item.description)
    const location = str(categories.location) ?? str(item.location)
    const commitment = str(categories.commitment)
    jobs.push({
      sourceId: 'lever',
      sourceJobId: id,
      title,
      company,
      companyLogo: str(item.company_logo) ?? str(asRecord(item.company).logo),
      locationRaw: location,
      remote: isRemoteText(location, description, commitment),
      employmentType: commitment ? commitment.toLowerCase() : str(item.employmentType),
      description,
      excerpt: excerpt(description),
      skills: skills(item.tags).length > 0 ? skills(item.tags) : extractSkills(description),
      postedAt: parseDate(item.createdAt),
      applyUrl: str(item.applyUrl) ?? str(item.hostedUrl),
      sourceUrl: str(item.hostedUrl) ?? str(item.applyUrl),
      attribution: { required: false, label: 'Lever', url: `https://jobs.lever.co/${slug}` },
      raw: item,
    })
  }
  return output(jobs, snapshot, url, contentHash, null)
}

// ── Ashby ───────────────────────────────────────────────────────────────────
const ashby: SourceAdapter = async (ctx) => {
  const slug = configString(ctx.config, 'slug')
  if (!slug) throw new Error('Ashby source needs config.slug')
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`
  const { json, snapshot, contentHash } = await fetchJson(url, ctx)
  const rows = asArray(asRecord(json).jobs)
  const company = configString(ctx.config, 'company') || slug
  const jobs: DiscoveryJob[] = []
  for (const row of rows) {
    const item = asRecord(row)
    if (bool(item.isListed) === false) continue
    const id = str(item.id)
    const title = str(item.title)
    if (!id || !title) continue
    const description = text(item.descriptionPlain ?? item.descriptionHtml ?? item.description ?? item.jobDescription ?? item.responsibilities)
    const location = str(item.location)
    const compensation = str(item.compensationTierSummary) ?? str(item.salary)
    jobs.push({
      sourceId: 'ashby',
      sourceJobId: id,
      title,
      company,
      companyLogo: str(item.companyLogo) ?? str(asRecord(item.company).logo),
      locationRaw: location,
      remote: Boolean(item.isRemote) || isRemoteText(location, description),
      employmentType: (() => {
        const value = String(item.employmentType ?? item.workplaceType ?? '').toLowerCase()
        if (value.includes('full')) return 'full-time'
        if (value.includes('part')) return 'part-time'
        if (value.includes('contract')) return 'contract'
        if (value.includes('intern')) return 'intern'
        if (value.includes('temporary')) return 'temporary'
        return undefined
      })(),
      ...salaryFields(compensation),
      description,
      excerpt: excerpt(description),
      skills: skills(item.skills ?? item.tags).length > 0 ? skills(item.skills ?? item.tags) : extractSkills(description),
      postedAt: parseDate(item.postedAt ?? item.createdAt),
      applyUrl: str(item.jobUrl) ?? str(item.applyUrl),
      sourceUrl: str(item.jobUrl) ?? str(item.sourceUrl),
      attribution: { required: false, label: 'Ashby', url: `https://jobs.ashbyhq.com/${slug}` },
      raw: item,
    })
  }
  return output(jobs, snapshot, url, contentHash, null)
}

// ── SmartRecruiters ─────────────────────────────────────────────────────────
const smartrecruiters: SourceAdapter = async (ctx) => {
  const company = configString(ctx.config, 'company')
  if (!company) throw new Error('SmartRecruiters source needs config.company')
  const limit = Number(configString(ctx.config, 'limit') || 100)
  const offset = Number(ctx.cursor ?? 0) || 0
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=${limit}&offset=${offset}`
  const { json, snapshot, contentHash } = await fetchJson(url, ctx)
  const body = asRecord(json)
  const rows = asArray(body.content)
  const total = Number(body.totalFound ?? rows.length)
  const jobs: DiscoveryJob[] = []
  for (const row of rows) {
    const item = asRecord(row)
    const id = str(item.id)
    const title = str(item.name) ?? str(item.title)
    if (!id || !title) continue
    const location = asRecord(item.location)
    const locationText = [str(location.city), str(location.region), str(location.country)].filter(Boolean).join(', ') || str(item.location)
    const description = text(item.description ?? item.jobDescription)
    jobs.push({
      sourceId: 'smartrecruiters',
      sourceJobId: id,
      title,
      company: str(item.company) ?? company,
      companyLogo: str(item.companyLogo) ?? str(asRecord(item.company).logo),
      locationRaw: locationText,
      remote: isRemoteText(locationText, description, item.remote),
      employmentType: str(asRecord(item.typeOfEmployment).label) ?? str(item.employmentType),
      seniority: str(asRecord(item.experienceLevel).label) ?? str(item.seniority),
      description,
      excerpt: excerpt(description),
      skills: skills(item.skills ?? item.tags).length > 0 ? skills(item.skills ?? item.tags) : extractSkills(description),
      postedAt: parseDate(item.releasedDate ?? item.createdOn),
      applyUrl: str(item.applyUrl) ?? `https://jobs.smartrecruiters.com/${company}/${id}`,
      sourceUrl: str(item.jobUrl) ?? `https://jobs.smartrecruiters.com/${company}/${id}`,
      attribution: { required: false, label: 'SmartRecruiters', url: `https://jobs.smartrecruiters.com/${company}` },
      raw: item,
    })
  }
  const detailLimit = Number(configString(ctx.config, 'detail_limit') || 50)
  const toFetch = jobs
    .filter((job) => !job.description)
    .sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
    .slice(0, detailLimit)
  await withConcurrency(toFetch, 4, async (job) => {
    const detailUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(job.sourceJobId)}`
    const { json } = await fetchJson(detailUrl, ctx)
    const detail = asRecord(json)
    const content = text(detail.description ?? detail.jobDescription ?? detail.content)
    if (content) {
      job.description = content
      job.excerpt = excerpt(content)
      if (job.skills.length === 0) job.skills = extractSkills(content)
    }
    const apply = str(detail.applyUrl ?? detail.jobUrl)
    if (apply) job.applyUrl = apply
  })
  const nextOffset = offset + rows.length
  const cursor = nextOffset < total ? String(nextOffset) : null
  return output(jobs, snapshot, url, contentHash, cursor)
}

// ── Himalayas ───────────────────────────────────────────────────────────────
const himalayas: SourceAdapter = async (ctx) => {
  const limit = Number(configString(ctx.config, 'limit') || 100)
  const cursor = ctx.cursor ?? ''
  const url = `https://himalayas.app/jobs/api?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
  const { json, snapshot, contentHash } = await fetchJson(url, ctx)
  const body = asRecord(json)
  const rows = asArray(body.jobs)
  const jobs: DiscoveryJob[] = []
  for (const row of rows) {
    const item = asRecord(row)
    const id = str(item.guid) ?? str(item.id)
    const title = str(item.title)
    if (!id || !title) continue
    const description = text(item.description ?? item.excerpt)
    const restrictions = asArray(item.locationRestrictions).map((value) => String(value))
    // Himalayas is a remote-only board: a location/timezone restriction bounds
    // where a remote hire may live, it does not make the role onsite.
    const timezoneOffsets = asArray(item.timezoneRestrictions).map((value) => String(value))
    const locationRaw = [
      restrictions.join(', '),
      ...timezoneOffsets.map((offset) => `UTC${Number(offset) >= 0 ? '+' : ''}${offset}`),
    ].filter(Boolean).join(', ') || 'Remote'
    const seniority = asArray(item.seniority).map((value) => String(value))[0]
    const salary = salaryFields(`${str(item.minSalary) ?? ''} ${str(item.maxSalary) ?? ''} ${str(item.currency) ?? ''}`.trim())
    jobs.push({
      sourceId: 'himalayas',
      sourceJobId: id,
      title,
      company: str(item.companyName) ?? 'Unknown company',
      companyLogo: str(item.companyLogo),
      locationRaw,
      remote: true,
      employmentType: (str(item.employmentType) ?? '').toLowerCase().replace(' ', '-'),
      seniority: (seniority ?? '').toLowerCase(),
      ...salary,
      description,
      excerpt: excerpt(description),
      skills: skills(item.skills ?? item.tags).length > 0 ? skills(item.skills ?? item.tags) : extractSkills(description),
      categories: asArray(item.categories).map((value) => String(value)),
      postedAt: parseDate(item.pubDate),
      expiresAt: parseDate(item.expiryDate),
      applyUrl: str(item.applicationLink) ?? str(item.url),
      sourceUrl: str(item.applicationLink) ?? str(item.url),
      attribution: { required: false, label: 'Himalayas', url: 'https://himalayas.app' },
      raw: item,
    })
  }
  const nextCursor = str(body.nextCursor) ?? null
  return { jobs, cursor: nextCursor, snapshot: { ...snapshot, url, contentHash } }
}

// ── Jobicy ──────────────────────────────────────────────────────────────────
const jobicy: SourceAdapter = async (ctx) => {
  const count = Number(configString(ctx.config, 'count') || 100)
  const industry = configString(ctx.config, 'industry') ?? 'engineering'
  const cursor = ctx.cursor ?? ''
  const url = `https://jobicy.com/api/v2/remote-jobs?count=${count}&industry=${encodeURIComponent(industry)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
  const { json, snapshot, contentHash } = await fetchJson(url, ctx)
  const body = asRecord(json)
  const rows = asArray(body.jobs)
  const jobs: DiscoveryJob[] = []
  for (const row of rows) {
    const item = asRecord(row)
    const id = str(item.id)
    const title = str(item.jobTitle)
    if (!id || !title) continue
    const description = text(item.jobDescription ?? item.jobExcerpt)
    const geo = str(item.jobGeo) ?? ''
    const jobType = asArray(item.jobType).map((value) => String(value)).join(', ')
    const level = str(item.jobLevel) ?? ''
    const salary = salaryFields(`${str(item.salaryMin) ?? ''} ${str(item.salaryMax) ?? ''} ${str(item.salaryCurrency) ?? ''} ${str(item.salaryPeriod) ?? ''}`.trim())
    jobs.push({
      sourceId: 'jobicy',
      sourceJobId: id,
      title,
      company: str(item.companyName) ?? 'Unknown company',
      companyLogo: str(item.companyLogo),
      locationRaw: geo || 'Remote',
      // Jobicy is a remote-only board; jobGeo is the permitted work region.
      remote: true,
      employmentType: jobType.toLowerCase().replace(' ', '-'),
      seniority: level.toLowerCase(),
      ...salary,
      description,
      excerpt: excerpt(description),
      skills: extractSkills(description),
      categories: asArray(item.jobIndustry).map((value) => String(value)),
      postedAt: parseDate(item.pubDate),
      applyUrl: str(item.url),
      sourceUrl: str(item.url),
      attribution: { required: false, label: 'Jobicy', url: 'https://jobicy.com' },
      raw: item,
    })
  }
  const hasMore = Boolean(body.hasMore)
  const nextCursor = hasMore ? str(body.nextCursor) ?? 'next' : null
  return { jobs, cursor: nextCursor, snapshot: { ...snapshot, url, contentHash } }
}

export const ADAPTERS: Record<string, SourceAdapter> = {
  remoteok,
  remotive,
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  himalayas,
  jobicy,
}

export function adapterFor(sourceId: string): SourceAdapter | null {
  return ADAPTERS[sourceId] ?? null
}
