import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { extractUpworkJob, generateUpworkApplication } from '@/lib/upwork-v2'
import { computeProfileMatch } from '@/lib/profile-match'

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

/**
 * POST /api/upwork/[id]/generate
 * Generate application (cover letter + screening answers) for a job + profile.
 */
export async function POST_generate(req: NextRequest) {
  const store = createServiceSupabase()
  const { data: auth } = await store.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data: rep } = await store
    .from('reps')
    .select('id, organization_id')
    .eq('user_id', auth.user.id)
    .single()

  if (!rep) return NextResponse.json({ error: 'Not a rep.' }, { status: 401 })

  let body: { jobId?: string; profileId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  if (!body.jobId || !body.profileId) {
    return NextResponse.json({ error: 'jobId and profileId required.' }, { status: 400 })
  }

  // Fetch job
  const { data: job } = await store
    .from('upwork_jobs')
    .select('*')
    .eq('id', body.jobId)
    .eq('organization_id', rep.organization_id)
    .single()

  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })

  // Fetch profile
  const { data: profile } = await store
    .from('profiles')
    .select('id, display_name, full_name, primary_skills, secondary_skills, technologies, service_capabilities, industries, differentiators')
    .eq('id', body.profileId)
    .eq('organization_id', rep.organization_id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })

  // Compute match
  const match = computeProfileMatch(
    { opportunityCapabilities: job.skills || [], opportunityIndustries: [], opportunityType: 'upwork_job', jobId: job.id },
    {
      profileId: profile.id,
      identityName: profile.display_name || profile.full_name || 'Unknown',
      skills: [...(profile.primary_skills || []), ...(profile.secondary_skills || [])],
      technologies: profile.technologies || [],
      expertise: profile.service_capabilities || [],
      industries: profile.industries || [],
      allowedClaims: profile.differentiators || [],
    },
  )

  // Generate application
  const application = await generateUpworkApplication(
    {
      title: job.title,
      description: job.description || '',
      skills: job.skills || [],
      screeningQuestions: job.screening_questions || [],
      budget: job.budget || null,
      budgetType: (job.budget_type as 'fixed' | 'hourly' | null) || null,
      hourlyRateMin: job.hourly_rate_min || null,
      hourlyRateMax: job.hourly_rate_max || null,
      experienceLevel: job.experience_level || null,
      projectLength: job.project_length || null,
      locationRestrictions: job.location_restrictions || [],
      clientName: job.client_name || null,
    },
    {
      identityName: profile.display_name || profile.full_name || 'Unknown',
      skills: [...(profile.primary_skills || []), ...(profile.secondary_skills || [])],
      technologies: profile.technologies || [],
      expertise: profile.service_capabilities || [],
      industries: profile.industries || [],
      allowedClaims: profile.differentiators || [],
    },
    match.matchScore,
    match.matchingCapabilities,
    match.missingCapabilities,
  )

  if (!application) {
    return NextResponse.json({ error: 'Failed to generate application.' }, { status: 500 })
  }

  // Persist application
  const { data: savedApp } = await store
    .from('upwork_applications')
    .insert({
      job_id: body.jobId,
      profile_id: body.profileId,
      organization_id: rep.organization_id,
      owner_rep_id: rep.id,
      cover_letter: application.coverLetter,
      question_answers: application.questionAnswers,
      fit_score: application.fitScore,
      fit_reason: application.fitReason,
      risks: application.risks,
    })
    .select('id')
    .single()

  return NextResponse.json({
    application: {
      ...application,
      id: savedApp?.id,
      matchScore: match.matchScore,
      matchingCapabilities: match.matchingCapabilities,
      missingCapabilities: match.missingCapabilities,
    },
  })
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
