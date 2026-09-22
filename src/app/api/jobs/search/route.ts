import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { searchJobs } from '@/lib/jobs'
import type { ExtractedCv, JobSearchParamsInput } from '@/lib/jobs'

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function bool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  if (typeof value === 'number') return Boolean(value)
  return undefined
}

function posInt(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined
  return Number.isInteger(value) && value > 0 ? value : undefined
}

function posNum(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())).map((v) => v.trim())
  return out.length > 0 ? out : undefined
}

/** Parses an uploaded-CV payload sent by the client in the same request. */
function readCv(value: unknown): ExtractedCv | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const role = str(raw.role)
  if (!role) return null
  return {
    role,
    seniority: str(raw.seniority),
    skills: strings(raw.skills) ?? [],
    technologies: strings(raw.technologies),
    company: str(raw.company),
    summary: str(raw.summary),
    sourceLabel: str(raw.sourceLabel) ?? 'uploaded-cv',
  }
}

function readInput(body: Record<string, unknown>): JobSearchParamsInput {
  return {
    profileId: str(body.profileId) ?? null,
    role: str(body.role),
    query: str(body.query) ?? '',
    location: str(body.location),
    country: str(body.country),
    remote: bool(body.remote),
    hybrid: bool(body.hybrid),
    onsite: bool(body.onsite),
    minimumSalary: posNum(body.minimumSalary),
    salaryCurrency: str(body.salaryCurrency),
    employmentType: str(body.employmentType),
    seniority: str(body.seniority),
    skills: strings(body.skills),
    limit: posInt(body.limit),
    page: posInt(body.page),
    aiMatching: bool(body.aiMatching),
    mock: bool(body.mock),
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const input = readInput(body)
  const cvOverride = readCv(body.cv)

  // An uploaded CV wins over profile loading; otherwise use the user's voice
  // profile (defaults to their first profile) and its proof tags to power the
  // generated queries and the match scores.
  let profile: { headline: string | null; label: string | null; platform: string | null } | null = null
  let proofTags: string[] = []
  if (!cvOverride) {
    try {
      const profiles = input.profileId
        ? [await store.getProfile(input.profileId)]
        : await store.listProfiles()
      const chosen = profiles.find((p): p is NonNullable<typeof p> => Boolean(p)) ?? null
      if (chosen) {
        profile = {
          headline: chosen.headline ?? null,
          label: chosen.label ?? null,
          platform: chosen.platform ?? null,
        }
        const items = await store.listProofItems(chosen.id)
        proofTags = items.flatMap((item) => item.tags ?? [])
      }
    } catch {
      // Profile loading is best-effort; a manual search still works without one.
      profile = null
      proofTags = []
    }
  }

  try {
    const result = await searchJobs(input, {
      profile,
      proofTags,
      cv: cvOverride ?? undefined,
      mock: input.mock ?? undefined,
    })
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Job search failed.' },
      { status: 500 },
    )
  }
}