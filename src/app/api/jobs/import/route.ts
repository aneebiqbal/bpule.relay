import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { createServiceSupabase } from '@/lib/supabase/service'
import { classifyRemoteEligibility } from '@/lib/job-discovery/eligibility'

export const dynamic = 'force-dynamic'

/**
 * Manual / browser-assisted job import.
 *
 * LinkedIn and other prohibited sources are never scraped. A human pastes the
 * posting they can already see; Relay stores it as a canonical job with
 * `verification_needed`, never as verified.
 */
export async function POST(request: Request) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const company = typeof body.company === 'string' ? body.company.trim() : ''
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!title || !description) {
    return NextResponse.json({ error: 'Title and description are required.' }, { status: 400 })
  }
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'URL must be http(s).' }, { status: 400 })
  }

  const locationRaw = typeof body.locationRaw === 'string' ? body.locationRaw : null
  const eligibility = classifyRemoteEligibility({ title, description, locationRaw, remote: body.remote === true })
  const now = new Date()
  const sourceJobId = typeof body.sourceJobId === 'string' && body.sourceJobId.trim()
    ? body.sourceJobId.trim()
    : `manual-${createHash('sha256').update(`${title}|${company}|${url}`).digest('hex').slice(0, 16)}`
  const contentHash = createHash('sha256').update(JSON.stringify({ title, company, description, url })).digest('hex')
  const db = createServiceSupabase()
  const result = await db.raw!(
    `insert into jobs (
       source_id, source_job_id, title, company, location_raw, country, remote,
       description, excerpt, skills, apply_url, source_url, attribution, raw,
       eligibility, verification_status, verification_evidence,
       first_seen_at, last_seen_at, last_checked_at, content_hash, dedupe_key
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (source_id, source_job_id) do update set
       title = excluded.title, company = excluded.company, description = excluded.description,
       apply_url = excluded.apply_url, source_url = excluded.source_url,
       eligibility = excluded.eligibility, content_hash = excluded.content_hash,
       last_seen_at = excluded.last_seen_at, last_checked_at = excluded.last_checked_at,
       verification_status = 'verification_needed', updated_at = now()
     returning id`,
    [
      'manual', sourceJobId, title, company || null, typeof body.locationRaw === 'string' ? body.locationRaw : null,
      eligibility.countries[0] ?? null, eligibility.remote, description, description.slice(0, 280), [],
      url || null, url || null, JSON.stringify({ required: false, label: 'Manual import' }),
      JSON.stringify({ title, company, url, description }), JSON.stringify(eligibility),
      'verification_needed', JSON.stringify([{ at: now.toISOString(), type: 'manual_import', source_id: 'manual', source_url: url || null }]),
      now, now, now, contentHash, `${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${company.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`,
    ],
  )
  if (result.error) return NextResponse.json({ error: 'Could not save the job.' }, { status: 500 })
  return NextResponse.json({ ok: true, id: result.data?.[0]?.id ?? null }, { status: 201 })
}
