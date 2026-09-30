import { NextResponse } from 'next/server'
import { getAuthContext, type AuthContext } from '@/lib/auth/organization'
import { profileAccess } from './access'
import { createServiceSupabase } from '@/lib/supabase/service'
import { EnrichmentError, type AiContextSynthesizer } from './enrichment-service'
import { synthesizeAiContext } from './pipeline'

export async function requireProfileManager(): Promise<{ auth: AuthContext } | { response: NextResponse }> {
  const auth = await getAuthContext()
  if (!auth) return { response: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!profileAccess(auth).canManage) return { response: NextResponse.json({ error: 'Only admins and managers can import or change profile data.' }, { status: 403 }) }
  return { auth }
}

export function enrichmentErrorResponse(err: unknown, route: string): NextResponse {
  if (err instanceof EnrichmentError) {
    return NextResponse.json({ error: err.message, details: err.details ?? null }, { status: err.status })
  }
  console.error(`[${route}]`, err)
  return NextResponse.json({ error: 'Unexpected error. No changes were applied.' }, { status: 500 })
}

/** Ensures the run in the URL belongs to the profile in the URL. */
export async function assertRunForProfile(orgId: string, profileId: string, runId: string) {
  const client = createServiceSupabase()
  const { data } = await client.from('profile_enrichment_runs').select('id, profile_id').eq('id', runId).eq('organization_id', orgId).maybeSingle()
  if (!data || data.profile_id !== profileId) throw new EnrichmentError('Import not found for this profile.', 404)
  return client
}

export const aiContextSynthesizer: AiContextSynthesizer = async (profile, state, orgId) => {
  const facts = {
    fullName: profile.full_name, displayName: profile.display_name, currentRole: profile.current_role, company: profile.company,
    location: profile.location, headline: profile.headline, bio: profile.bio, professionalSummary: profile.professional_summary,
    seniority: profile.seniority, yearsExperience: profile.years_experience, primarySkills: profile.primary_skills ?? [],
    secondarySkills: profile.secondary_skills ?? [], technologies: profile.technologies ?? [], industries: profile.industries ?? [],
    serviceCapabilities: profile.service_capabilities ?? [], specialties: profile.specialties ?? [], positioning: profile.positioning,
    differentiators: profile.differentiators ?? [], languages: profile.languages ?? [], communicationStyle: profile.communication_style ?? {},
    projects: [], proofs: [], reviews: [], people: [],
  }
  const projects = state.projects.map((p) => ({
    name: p.project_title, clientCompany: p.client_company ?? null, role: p.my_role, summary: p.description ?? '', technologies: p.technologies ?? [],
    responsibilities: [], problem: null, workPerformed: null, outcome: p.outcome ?? null, startDate: p.start_date ?? null, endDate: p.end_date ?? null,
    evidenceType: 'explicit_claim' as const, confidence: 0.8, sourceReferences: [],
  }))
  const proofs = state.proofs.map((p) => ({
    claim: p.safe_claim, whyItMatters: '', supportingEvidence: '', technologyDomain: null, confidence: 0.8, safeForOutreach: true, evidenceType: 'explicit_claim' as const,
  }))
  return (await synthesizeAiContext(facts, projects, proofs, orgId)) as unknown as Record<string, unknown>
}
