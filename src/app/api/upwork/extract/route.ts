import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { extractUpworkJob } from '@/lib/upwork-v2'

export const maxDuration = 120

/**
 * POST /api/upwork/extract
 * Extract structured job data from pasted Upwork job text.
 */
export async function POST(req: NextRequest) {
  const store = createServiceSupabase()
  const { data: auth } = await store.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data: rep } = await store
    .from('reps')
    .select('id, organization_id')
    .eq('user_id', auth.user.id)
    .single()

  if (!rep) return NextResponse.json({ error: 'Not a rep.' }, { status: 401 })

  let body: { rawText?: string; url?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  if (!body.rawText || body.rawText.length < 50) {
    return NextResponse.json({ error: 'Job text too short.' }, { status: 400 })
  }

  const job = await extractUpworkJob({ rawText: body.rawText, url: body.url })
  if (!job) {
    return NextResponse.json({ error: 'Failed to extract job data.' }, { status: 500 })
  }

  // Persist job
  const { data: savedJob, error: saveError } = await store
    .from('upwork_jobs')
    .insert({
      organization_id: rep.organization_id,
      owner_rep_id: rep.id,
      title: job.title,
      description: job.description,
      skills: job.skills,
      budget: job.budget,
      budget_type: job.budgetType,
      hourly_rate_min: job.hourlyRateMin,
      hourly_rate_max: job.hourlyRateMax,
      experience_level: job.experienceLevel,
      project_length: job.projectLength,
      location_restrictions: job.locationRestrictions,
      client_name: job.clientName || null,
      url: body.url || null,
      raw_content_hash: hashContent(body.rawText),
      screening_questions: job.screeningQuestions,
    })
    .select('id')
    .single()

  if (saveError) {
    // Duplicate content hash — return existing job
    if (saveError.code === '23505') {
      const { data: existing } = await store
        .from('upwork_jobs')
        .select('*')
        .eq('raw_content_hash', hashContent(body.rawText))
        .single()
      if (existing) return NextResponse.json({ job: existing, duplicate: true })
    }
    return NextResponse.json({ error: 'Failed to save job.' }, { status: 500 })
  }

  return NextResponse.json({ job: { ...job, id: savedJob?.id }, duplicate: false })
}

function hashContent(text: string): string {
  let hash = 0
  const normalized = text.replace(/\s+/g, ' ').trim().slice(0, 1000)
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}
