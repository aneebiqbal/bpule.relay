import { generate } from '@/lib/ai/runtime'
import type { ContentProfileExpertise, ContentProfileOpinion } from '@/lib/domain/types'

export interface AIExtractedIdentity {
  role: string
  seniority: string
  company: string
  industries: string[]
  expertise: ContentProfileExpertise[]
  opinions: ContentProfileOpinion[]
  projects: { name: string; description: string; role: string; outcome: string; lessons: string[]; updatedAt: string }[]
  experiences: { type: string; description: string; lesson: string; date: string | null; updatedAt: string }[]
  technologies: string[]
  audiences: string[]
  territories: string[]
  contentGoals: string[]
  personalityNotes: string
}

export async function extractIdentityWithAI(sourceText: string): Promise<AIExtractedIdentity> {
  const system = `You are a persona extraction engine for a LinkedIn content platform. Analyze the provided LinkedIn profile/bio text and extract a detailed professional identity.

Output ONLY valid JSON with this exact structure:
{
  "role": "their job title/role",
  "seniority": "junior|mid|senior|lead|principal|executive",
  "company": "current company name",
  "industries": ["industry 1", "industry 2"],
  "expertise": [{"area": "skill area", "level": "beginner|intermediate|advanced|expert", "evidence": "brief proof from text", "updatedAt": "2025-01-01T00:00:00Z"}],
  "opinions": [{"belief": "a strong professional opinion they hold", "strength": "mild|moderate|strong", "evidence": "why they believe this", "source": "onboarding", "updatedAt": "2025-01-01T00:00:00Z"}],
  "projects": [{"name": "project name", "description": "what it was", "role": "their role", "outcome": "result", "lessons": ["lesson 1"], "updatedAt": "2025-01-01T00:00:00Z"}],
  "experiences": [{"type": "project|mistake|success|decision|lesson", "description": "what happened", "lesson": "what they learned", "date": null, "updatedAt": "2025-01-01T00:00:00Z"}],
  "technologies": ["tool 1", "tool 2"],
  "audiences": ["founders", "sales leaders"],
  "territories": ["3-5 SPECIFIC trending content territories"],
  "contentGoals": ["authority", "leads"],
  "personalityNotes": "their unique voice and angle"
}

CRITICAL RULES:
- Territories must be SPECIFIC and TRENDING. Not "sales" but "inbound conversion for service businesses" or "the death of cold outreach in 2025".
- Extract real opinions from their text, not generic ones.
- Expertise "evidence" must quote or reference their actual text.
- Be HIGHLY specific to THIS person. Extract their unique stories, metrics, and voice.
- Extract projects and experiences with real details from their bio.`

  const result = await generate<AIExtractedIdentity>({
    task: 'FAST_STRUCTURED',
    system,
    user: sourceText.slice(0, 4000),
    promptVersion: 'onboarding-extract-v3',
    callSite: 'onboarding:extractAI',
    feature: 'studio_onboarding',
  })

  // Fix updatedAt fields if AI returned wrong format
  const now = new Date().toISOString()
  return {
    ...result.data,
    expertise: result.data.expertise?.map(e => ({ ...e, updatedAt: now })) ?? [],
    opinions: result.data.opinions?.map(o => ({ ...o, updatedAt: now })) ?? [],
    projects: result.data.projects?.map(p => ({ ...p, updatedAt: now })) ?? [],
    experiences: result.data.experiences?.map(e => ({ ...e, updatedAt: now })) ?? [],
  }
}
