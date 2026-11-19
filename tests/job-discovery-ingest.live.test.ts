/**
 * Live-DB ingestion contract for Job Intelligence v2.
 *
 * Requires a disposable database with the v2 migration applied:
 *   TEST_DATABASE_URL=postgres://... npx vitest run --config vitest.live.config.mts
 *
 * The suite truncates only the v2 tables and the seeded source rows it adds.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import {
  listApplications,
  listDocuments,
  listJobs,
  saveDocuments,
  setSavedJob,
  transitionApplication,
  upsertApplication,
} from '@/lib/job-discovery/service'
import { createServiceSupabase } from '@/lib/supabase/service'

const url = process.env.TEST_DATABASE_URL
const pool = new Pool({ connectionString: url })

const payload = [
  { legal: true },
  {
    id: 'live-1',
    company: 'Acme',
    position: 'Senior Backend Engineer',
    url: 'https://remoteok.com/remote-jobs/live-1',
    location: 'Remote',
    description: '<p>US only. Node.js and PostgreSQL.</p>',
    date: 1_700_000_000_000,
    tags: ['node', 'postgres'],
  },
]

const mockFetch = (async () => new Response(JSON.stringify(payload), {
  status: 200,
  headers: { 'content-type': 'application/json' },
})) as typeof fetch

const failingFetch = (async () => new Response('down', { status: 503 })) as typeof fetch

const ORG_ID = '11111111-1111-1111-1111-111111111111'
const REP_ID = '22222222-2222-2222-2222-222222222222'
const PROFILE_ID = '33333333-3333-3333-3333-333333333333'

async function reset() {
  await pool.query('truncate jobs, ingestion_runs, source_snapshots, job_duplicate_groups, job_discovery_locks restart identity cascade')
  await pool.query("delete from job_sources where id in ('remoteok', 'remoteok2')")
  await pool.query(
    `insert into job_sources (id, name, kind, base_url, config, enabled, interval_secs)
     values ('remoteok', 'RemoteOK', 'feed', 'https://remoteok.com/api', '{}', true, 3600)`,
  )
  await pool.query('delete from application_events')
  await pool.query('delete from applications')
  await pool.query('delete from application_documents')
  await pool.query('delete from saved_jobs')
  await pool.query('delete from job_matches')
  await pool.query('delete from profiles where id = $1', [PROFILE_ID])
  await pool.query('delete from reps where id = $1', [REP_ID])
  await pool.query('delete from organizations where id = $1', [ORG_ID])
  await pool.query('insert into organizations (id) values ($1)', [ORG_ID])
  await pool.query('insert into reps (id, organization_id, role) values ($1, $2, $3)', [REP_ID, ORG_ID, 'admin'])
  await pool.query('insert into profiles (id, rep_id, organization_id) values ($1, $2, $3)', [PROFILE_ID, REP_ID, ORG_ID])
}

describe.skipIf(!url)('Job Intelligence v2 ingestion (live DB)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.SERVICE_DATABASE_URL = url
    process.env.RELAY_DB_PROVIDER = 'postgres'
    await reset()
  })

  afterAll(async () => {
    await reset()
    await pool.end()
  })

  it('is idempotent: a second run updates instead of duplicating', async () => {
    const { runJobDiscovery } = await import('@/lib/job-discovery/ingest')
    const first = await runJobDiscovery({ sourceIds: ['remoteok'], fetchFn: mockFetch, maxSources: 1, timeoutMs: 2000 })
    expect(first.summaries[0]).toMatchObject({ status: 'ok', inserted: 1, updated: 0 })

    await pool.query("update job_sources set last_run_at = null where id = 'remoteok'")
    const second = await runJobDiscovery({ sourceIds: ['remoteok'], fetchFn: mockFetch, maxSources: 1, timeoutMs: 2000 })
    expect(second.summaries[0]).toMatchObject({ status: 'ok', inserted: 0, updated: 1 })
    const { rows } = await pool.query('select count(*)::int as n from jobs')
    expect(rows[0].n).toBe(1)
  })

  it('never marks an existing job closed when the source fetch fails', async () => {
    const { runJobDiscovery } = await import('@/lib/job-discovery/ingest')
    await pool.query("update job_sources set last_run_at = null where id = 'remoteok'")
    const result = await runJobDiscovery({ sourceIds: ['remoteok'], fetchFn: failingFetch, maxSources: 1, timeoutMs: 2000 })
    expect(result.summaries[0].status).toBe('failed')
    const { rows } = await pool.query('select verification_status, closed_at from jobs where source_job_id = $1', ['live-1'])
    expect(rows[0].verification_status).toBe('recently_seen')
    expect(rows[0].closed_at).toBeNull()
  })

  it('links the same real job listed on two sources into one duplicate group', async () => {
    await pool.query(
      `insert into job_sources (id, name, kind, base_url, config, enabled, interval_secs)
       values ('remoteok2', 'RemoteOK 2', 'feed', 'https://example.com', '{}', true, 3600)`,
    )
    const { ADAPTERS } = await import('@/lib/job-discovery/adapters')
    ;(ADAPTERS as Record<string, unknown>).remoteok2 = ADAPTERS.remoteok
    const { runJobDiscovery } = await import('@/lib/job-discovery/ingest')
    const result = await runJobDiscovery({ sourceIds: ['remoteok2'], fetchFn: mockFetch, maxSources: 1, timeoutMs: 2000 })
    expect(result.summaries[0].status).toBe('ok')
    const { rows } = await pool.query('select dedupe_key, count(*)::int as n, count(distinct duplicate_group_id)::int as groups from jobs group by dedupe_key')
    expect(rows[0].n).toBe(2)
    expect(rows[0].groups).toBe(1)
  })

  it('persists saved jobs, documents, applications and outcomes', async () => {
    const db = createServiceSupabase()
    const { rows } = await pool.query('select id from jobs where source_job_id = $1', ['live-1'])
    const jobId = rows[0].id as string

    await setSavedJob(db, ORG_ID, jobId, PROFILE_ID, REP_ID, true)
    await saveDocuments(db, ORG_ID, jobId, PROFILE_ID, [
      { kind: 'cv', text: 'Ada Lovelace\nSenior Backend Engineer', content: { name: 'Ada Lovelace' }, ats: { score: 80, extraction: { coverage: 1 } } },
    ])
    const applicationId = await upsertApplication(db, ORG_ID, {
      jobId,
      profileId: PROFILE_ID,
      repId: REP_ID,
      status: 'draft',
      method: 'external',
      destinationUrl: 'https://example.com/apply',
    })
    expect(applicationId).toBeTruthy()
    await transitionApplication(db, ORG_ID, applicationId!, 'applied', REP_ID, 'confirmed by human')

    const saved = await listJobs(db, ORG_ID, { view: 'saved', profileId: PROFILE_ID, limit: 10 })
    expect(saved.jobs).toHaveLength(1)
    expect(saved.jobs[0].saved).toBe(true)
    expect(saved.jobs[0].applicationStatus).toBe('applied')

    const documented = await listJobs(db, ORG_ID, { view: 'documents', profileId: PROFILE_ID, limit: 10 })
    expect(documented.jobs).toHaveLength(1)
    expect(documented.jobs[0].id).toBe(jobId)

    const applications = await listApplications(db, ORG_ID, PROFILE_ID)
    expect(applications[0]).toMatchObject({ status: 'applied', method: 'external' })
    const documents = await listDocuments(db, ORG_ID, PROFILE_ID, jobId)
    expect(documents).toHaveLength(1)
    expect(documents[0].kind).toBe('cv')
  })

  it('exposes jobs to authenticated roles only and keeps user tables org-scoped', async () => {
    const { rows } = await pool.query(
      `select tablename, policyname, cmd, roles::text
       from pg_policies
       where schemaname = 'public' and tablename in ('jobs', 'job_matches', 'saved_jobs', 'applications')
       order by tablename, cmd`,
    )
    const jobsSelect = rows.find((row) => row.tablename === 'jobs' && String(row.cmd).toUpperCase() === 'SELECT')
    expect(jobsSelect).toBeTruthy()
    expect(jobsSelect.roles).not.toContain('anon')
    const matchSelect = rows.find((row) => row.tablename === 'job_matches' && String(row.cmd).toUpperCase() === 'SELECT')
    expect(matchSelect).toBeTruthy()
  })
})
