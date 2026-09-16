import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { generateResume, scoreResume, type ResumeData, type ResumeTarget } from '@/lib/bd/resume-engine'

export async function POST(request: Request) {
  let body: {
    profileId?: string
    leadId?: string
    jobId?: string
    targetSkills?: string[]
    targetTitle?: string
    targetCompany?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { profileId, leadId, jobId, targetSkills, targetTitle, targetCompany } = body

  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const profiles = await store.listProfiles()
  const profile = profiles.find((p) => p.id === profileId)
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404})
  }

  const proofCards = await store.listProofCards(profile.id)
  const baseResume = buildBaseResume(profile.label ?? 'Profile', proofCards)

  let target: ResumeTarget = {
    title: targetTitle ?? null,
    company: targetCompany ?? null,
    requiredSkills: targetSkills ?? [],
    responsibilities: [],
    technologies: targetSkills ?? [],
  }

  if (leadId) {
    const lead = await store.getLead(leadId)
    if (lead) {
      target = { ...target, company: target.company ?? lead.company, title: target.title ?? lead.contactTitle, technologies: target.technologies.length > 0 ? target.technologies : lead.tags }
    }
  }

  if (jobId) {
    const job = await store.getUpworkJob(jobId)
    if (job) {
      target = { ...target, title: target.title ?? job.title, requiredSkills: target.requiredSkills.length > 0 ? target.requiredSkills : job.requiredSkills, technologies: target.technologies.length > 0 ? target.technologies : job.requiredSkills }
    }
  }

  const tailoredResume = generateResume(baseResume, target)
  const scoreResult = scoreResume(tailoredResume, target)

  // Persist the tailored CV as a job artifact
  let tailoredCvId: string | null = null
  try {
    const saved = await store.saveTailoredCV({
      jobId: jobId ?? '',
      revenueIdentityId: null,
      profileId: profile.id,
      baseResumeSnapshot: baseResume as unknown as Record<string, unknown>,
      tailoredResume: tailoredResume as unknown as Record<string, unknown>,
      atsScore: scoreResult.score,
      atsDimensions: scoreResult.dimensions,
      atsMissingSkills: scoreResult.missing,
      targetTitle: target.title,
      targetSkills: [...target.requiredSkills, ...target.technologies],
      targetCompany: target.company,
    })
    tailoredCvId = saved.id
  } catch {
    // Persistence is best-effort; the artifact is still returned even if storage fails
  }

  return NextResponse.json({
    resume: tailoredResume,
    score: scoreResult.score,
    dimensions: scoreResult.dimensions,
    missing: scoreResult.missing,
    profile: { id: profile.id, label: profile.label },
    tailoredCvId,
  })
}

function buildBaseResume(name: string, proofCards: { capability: string; safeClaim: string; tags: string[]; sourceReference: string | null; sourceType: string }[]): ResumeData {
  const experiences = proofCards
    .filter((c) => c.sourceType === 'project' || c.sourceType === 'client_work')
    .map((c) => ({ company: c.sourceReference ?? 'Client', role: c.capability, period: '', bullets: [c.safeClaim] }))

  const projects = proofCards.map((c) => ({ name: c.capability, description: c.safeClaim, technologies: c.tags, outcome: null }))
  const allTags = [...new Set(proofCards.flatMap((c) => c.tags))]

  return {
    name,
    title: proofCards[0]?.capability ?? 'Software Engineer',
    summary: `Experienced ${proofCards[0]?.capability ?? 'engineer'} with expertise in ${allTags.slice(0, 5).join(', ')}.`,
    skills: allTags,
    experience: experiences.length > 0 ? experiences : [],
    projects,
    education: [],
    certifications: proofCards.filter((c) => c.sourceType === 'certification').map((c) => c.capability),
  }
}
