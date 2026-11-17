import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { generate } from '@/lib/ai/runtime'
import { isMissingRelation } from '@/lib/operations/db-errors'

export const dynamic = 'force-dynamic'

/**
 * Setup Assistant — intent parsing only.
 *
 * Turns a sentence into a validated, org-scoped change preview. It never writes:
 * the caller must confirm and the apply path uses the canonical assignment and
 * target writers. Names are resolved server-side; unknown names become warnings
 * instead of guesses.
 */

const METRIC_ALIASES: Record<string, string> = {
  connections: 'connection_request',
  connection: 'connection_request',
  invites: 'connection_request',
  messages: 'dm',
  message: 'dm',
  dms: 'dm',
  dm: 'dm',
  emails: 'email',
  email: 'email',
  replies: 'followup',
  followups: 'followup',
  followup: 'followup',
  follow_ups: 'followup',
  applications: 'application',
  application: 'application',
  proposals: 'proposal',
  proposal: 'proposal',
  prospects: 'prospect_extracted',
  leads: 'prospect_extracted',
  tasks: 'other',
}

const OUTPUT_SCHEMA = {
  assignments: { type: 'array', required: false, description: 'profiles to staff, with optional channel' },
  targets: { type: 'array', required: false, description: 'channel targets to set' },
  schedules: { type: 'array', required: false, description: 'weekday coverage to apply' },
} as const

interface ParsedAssignment {
  profile?: unknown
  channel?: unknown
  primary?: unknown
  operators?: unknown
  backups?: unknown
}

interface ParsedTarget {
  profile?: unknown
  channel?: unknown
  metric?: unknown
  target?: unknown
  split?: unknown
}

interface ParsedSchedule {
  profile?: unknown
  rep?: unknown
  days?: unknown
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((row): row is string => typeof row === 'string' && row.trim().length > 0)
  return []
}

function normalizeKey(value: string): string {
  // The model echoes the "[id]" and "(full name)" annotations back; strip them
  // so "Muhammad Aneeb [abc]" resolves like "Muhammad Aneeb".
  return value
    .trim()
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s-]+/g, ' ')
    .trim()
}

/** Pull a channel mention out of a free-text request, if any. */
function channelFromText(value: string): string | null {
  const text = value.toLowerCase()
  if (text.includes('linkedin') || text.includes('linked in')) return 'linkedin'
  if (text.includes('upwork') || text.includes('up work')) return 'upwork'
  if (text.includes('email') || text.includes('e-mail')) return 'email'
  return null
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!ctx.isAdmin && !can(ctx, 'MANAGE_REVENUE_IDENTITIES') && !can(ctx, 'MANAGE_TEAM_TARGETS')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { prompt?: unknown }
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (prompt.length < 8) {
    return NextResponse.json({ error: 'Describe the change you want to make.' }, { status: 400 })
  }
  if (prompt.length > 2000) {
    return NextResponse.json({ error: 'That description is too long (2000 characters max).' }, { status: 400 })
  }

  const supabase = await createServerSupabase()
  const [profileRows, repRows, identityRows] = await Promise.all([
    supabase.from('profiles').select('id, display_name, full_name, label, person_id').eq('organization_id', ctx.orgId).limit(300),
    supabase.from('reps').select('id, name').eq('organization_id', ctx.orgId).limit(200),
    supabase.from('revenue_identities').select('id, identity_name, channel, profile_id').eq('organization_id', ctx.orgId).eq('status', 'active').limit(500),
  ])
  if (profileRows.error && !isMissingRelation(profileRows.error)) {
    return NextResponse.json({ error: 'Could not load profiles.' }, { status: 500 })
  }
  if (repRows.error && !isMissingRelation(repRows.error)) {
    return NextResponse.json({ error: 'Could not load people.' }, { status: 500 })
  }

  const profiles = (profileRows.data ?? []) as Array<{ id: string; display_name: string | null; full_name: string | null; label: string | null; person_id: string | null }>
  const reps = (repRows.data ?? []) as Array<{ id: string; name: string }>
  const identities = (identityRows.data ?? []) as Array<{ id: string; identity_name: string; channel: string; profile_id: string | null }>

  const profileName = (row: { display_name: string | null; full_name: string | null; label: string | null }) =>
    row.display_name ?? row.full_name ?? row.label ?? 'Unnamed profile'
  const profileAliases = (row: { display_name: string | null; full_name: string | null; label: string | null }) =>
    [row.display_name, row.full_name, row.label].filter((value): value is string => Boolean(value)).map(normalizeKey)
  const profileByKey = new Map<string, (typeof profiles)[number]>()
  for (const row of profiles) {
    for (const alias of profileAliases(row)) {
      if (!profileByKey.has(alias)) profileByKey.set(alias, row)
    }
  }
  const profileById = new Map(profiles.map((row) => [row.id, row]))
  const repByKey = new Map(reps.map((row) => [normalizeKey(row.name), row]))
  const repById = new Map(reps.map((row) => [row.id, row]))

  const entityPrompt = [
    `PEOPLE: ${reps.map((rep) => rep.name).join(', ') || 'none'}`,
    `PROFILES: ${profiles.map((row) => `${profileName(row)} [${row.id}]`).join(', ') || 'none'}`,
    `CHANNELS: ${[...new Set(identities.map((row) => row.channel))].join(', ') || 'none'}`,
  ].join('\n')

  const system = [
    'You are Relay\'s team setup assistant. Convert the administrator\'s request into a structured change preview.',
    'Use ONLY the people and profiles listed. Names may be matched case-insensitively; an unknown name is omitted and reported.',
    'Return JSON only. Do not invent profiles, people, channels or metrics.',
    'Metric aliases: connections, messages, replies, followups, applications, proposals, prospects, tasks.',
    'Assignments: profile, channel (optional), primary (one), operators (many), backups (many). "Assign/Add <people> to <profile>" means OPERATORS unless the request explicitly says primary or owner.',
    'Targets: profile, channel, metric, target (number), split (optional array of {rep, share}). A "60/40" split means 60% and 40% OF THE TARGET, not 60 and 40.',
    'Schedules: profile, rep, days (0=Sunday..6=Saturday). Include a schedule ONLY when the request explicitly mentions scheduling, days, weekdays or availability — never invent one.',
    'Change only what the request asks for. Do not add assignments, targets or schedules that were not requested.',
  ].join('\n')

  const { data } = await generate<Record<string, unknown>>({
    task: 'FAST_STRUCTURED',
    system: `${system}\n\n${entityPrompt}`,
    user: prompt,
    outputSchema: OUTPUT_SCHEMA as never,
    maxTokens: 1200,
    promptVersion: 'team-setup-assistant-v1',
    organizationId: ctx.orgId,
    repId: ctx.repId,
    feature: 'team_setup_assistant',
    callSite: 'team/setup/parse',
  })

  const warnings: string[] = []
  const rawAssignments = Array.isArray(data.assignments) ? (data.assignments as ParsedAssignment[]) : []
  const rawTargets = Array.isArray(data.targets) ? (data.targets as ParsedTarget[]) : []
  const rawSchedules = Array.isArray(data.schedules) ? (data.schedules as ParsedSchedule[]) : []

  const resolveProfile = (value: unknown, channel?: string | null): { id: string; name: string } | null => {
    if (typeof value !== 'string') return null
    const direct = profileById.get(value)
    if (direct) return { id: direct.id, name: profileName(direct) }
    const key = normalizeKey(value)
    if (!key) return null
    const tokens = key.split(' ').filter(Boolean)
    const matchIn = (pool: typeof profiles) => {
      const exactInPool = pool.find((row) => profileAliases(row).includes(key))
      if (exactInPool) return exactInPool
      const tokenMatches = pool.filter((row) =>
        profileAliases(row).some((alias) => tokens.every((token) => alias.includes(token))),
      )
      if (tokenMatches.length === 1) return tokenMatches[0]
      const substringMatches = pool.filter((row) =>
        profileAliases(row).some((alias) => alias.includes(key) || key.includes(alias)),
      )
      return substringMatches.length === 1 ? substringMatches[0] : null
    }
    // A channel in the request ("Aneeb's LinkedIn") disambiguates people who
    // have the same name on more than one platform — it wins over a bare name.
    if (channel) {
      const scoped = matchIn(
        profiles.filter((row) => identities.some((entry) => entry.profile_id === row.id && entry.channel === channel)),
      )
      if (scoped) return { id: scoped.id, name: profileName(scoped) }
    }
    const exact = profileByKey.get(key)
    if (exact) return { id: exact.id, name: profileName(exact) }
    const any = matchIn(profiles)
    return any ? { id: any.id, name: profileName(any) } : null
  }
  const resolveRep = (value: unknown): { id: string; name: string } | null => {
    if (typeof value !== 'string') return null
    const direct = repById.get(value)
    if (direct) return { id: direct.id, name: direct.name }
    const key = normalizeKey(value)
    if (!key) return null
    const exact = repByKey.get(key)
    if (exact) return { id: exact.id, name: exact.name }
    const tokens = key.split(' ').filter(Boolean)
    const tokenMatches = reps.filter((row) => tokens.every((token) => normalizeKey(row.name).includes(token)))
    if (tokenMatches.length === 1) return { id: tokenMatches[0].id, name: tokenMatches[0].name }
    const substringMatches = reps.filter((row) => {
      const alias = normalizeKey(row.name)
      return alias.includes(key) || key.includes(alias)
    })
    if (substringMatches.length === 1) return { id: substringMatches[0].id, name: substringMatches[0].name }
    return null
  }

  const assignments = rawAssignments.flatMap((row) => {
    const channel = typeof row.channel === 'string' ? row.channel.toLowerCase() : channelFromText(prompt)
    const profile = resolveProfile(row.profile, channel)
    if (!profile) {
      warnings.push(`Unknown profile: ${String(row.profile ?? '')}`)
      return []
    }
    const primary = row.primary != null ? resolveRep(row.primary) : null
    if (row.primary != null && !primary) warnings.push(`Unknown primary: ${String(row.primary)}`)
    const operators = stringList(row.operators).flatMap((name) => {
      const rep = resolveRep(name)
      if (!rep) warnings.push(`Unknown operator: ${name}`)
      return rep ? [rep] : []
    })
    const backups = stringList(row.backups).flatMap((name) => {
      const rep = resolveRep(name)
      if (!rep) warnings.push(`Unknown backup: ${name}`)
      return rep ? [rep] : []
    })
    return [{
      profileId: profile.id,
      profileName: profile.name,
      primaryRepId: primary?.id ?? null,
      primaryRepName: primary?.name ?? null,
      operators,
      backups,
    }]
  })

  const targets = rawTargets.flatMap((row) => {
    const profile = resolveProfile(row.profile)
    if (!profile) {
      warnings.push(`Unknown profile: ${String(row.profile ?? '')}`)
      return []
    }
    const metric = typeof row.metric === 'string' ? METRIC_ALIASES[row.metric.trim().toLowerCase()] : undefined
    const targetCount = Math.round(Number(row.target))
    if (!metric || !Number.isFinite(targetCount) || targetCount <= 0) {
      warnings.push(`Could not read a target for ${profile.name}`)
      return []
    }
    const channel = typeof row.channel === 'string' ? row.channel.toLowerCase() : null
    const identity = identities.find((entry) => entry.profile_id === profile.id && (!channel || entry.channel === channel))
    if (!identity) {
      warnings.push(`No ${channel ?? ''} channel on ${profile.name}`)
      return []
    }
    const split = Array.isArray(row.split) ? row.split : []
    const allocations = split.flatMap((entry) => {
      if (entry === null || typeof entry !== 'object') return []
      const record = entry as { rep?: unknown; share?: unknown }
      const rep = resolveRep(record.rep)
      const share = Math.round(Number(record.share))
      if (!rep || !Number.isFinite(share) || share <= 0) {
        warnings.push(`Could not read a split for ${profile.name}`)
        return []
      }
      return [{ repId: rep.id, repName: rep.name, targetCount: share }]
    })
    const total = allocations.reduce((sum, row) => sum + row.targetCount, 0)
    if (allocations.length > 0 && total > targetCount) {
      warnings.push(`${profile.name}: splits total ${total}, above the target of ${targetCount}`)
    }
    return [{
      profileId: profile.id,
      profileName: profile.name,
      identityId: identity.id,
      identityName: identity.identity_name,
      channel: identity.channel,
      activityType: metric,
      targetCount,
      allocations,
    }]
  })

  const schedules = rawSchedules.flatMap((row) => {
    const profile = resolveProfile(row.profile)
    const rep = resolveRep(row.rep)
    const days = Array.isArray(row.days)
      ? [...new Set((row.days as unknown[]).filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6))].sort()
      : []
    if (!profile || !rep || days.length === 0) {
      warnings.push(`Could not read a schedule for ${String(row.profile ?? '')}`)
      return []
    }
    return [{ profileId: profile.id, profileName: profile.name, repId: rep.id, repName: rep.name, daysOfWeek: days }]
  })

  return NextResponse.json({ prompt, preview: { assignments, targets, schedules }, warnings })
}
