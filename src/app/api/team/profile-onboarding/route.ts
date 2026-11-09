import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { assignPrimaryResponsibility } from '@/lib/profiles/assignment'

export const dynamic = 'force-dynamic'

/**
 * One canonical admin onboarding write: profile + channel identities + rep
 * assignment.
 *
 * The existing routes write these as separate non-atomic calls, so a failure
 * could leave a profile with no identity, or an identity with no assignment.
 * This endpoint performs the same canonical writes in order and reports exactly
 * which step failed, so the UI never claims a success that did not persist.
 * It does not delete anything on partial failure — the admin can retry the
 * missing step from the reported state.
 */

interface ChannelInput {
  channel: 'linkedin' | 'upwork' | 'email' | 'other'
  identityName: string
  title?: string
}

interface OnboardingBody {
  profileId?: string
  profile?: {
    fullName?: string
    title?: string
    summary?: string
    skills?: string[]
    profileUrl?: string
    headline?: string
  }
  channels?: ChannelInput[]
  repId?: string
}

interface OnboardingResult {
  status: 'ready' | 'partial' | 'failed'
  profileId: string | null
  identities: Array<{ id: string; channel: string; identityName: string }>
  assignments: Array<{ repId: string; identityId: string }>
  failed: 'profile' | 'identities' | 'assign' | null
  errors: string[]
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'identity'
}

export async function POST(request: Request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(ctx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  let body: OnboardingBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const repId = typeof body.repId === 'string' ? body.repId : ''
  if (!repId) return NextResponse.json({ error: 'repId is required.' }, { status: 400 })

  const channels = (body.channels ?? []).filter(
    (channel): channel is ChannelInput =>
      Boolean(channel && channel.channel && channel.identityName?.trim()),
  )
  if (channels.length === 0) {
    return NextResponse.json({ error: 'Select at least one channel.' }, { status: 400 })
  }

  const supabase = await createServerSupabase()
  const result: OnboardingResult = {
    status: 'ready',
    profileId: null,
    identities: [],
    assignments: [],
    failed: null,
    errors: [],
  }

  // 1. The sender profile — reused when a CV upload already created it.
  if (body.profileId) {
    const { data: existing, error: existingError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', body.profileId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle()
    if (existingError || !existing) {
      result.status = 'failed'
      result.failed = 'profile'
      result.errors.push('The uploaded profile is no longer available. Re-upload the document.')
      return NextResponse.json(result)
    }
    result.profileId = body.profileId
  } else {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .insert({
          organization_id: ctx.orgId,
          rep_id: repId,
          platform: channels.some((channel) => channel.channel === 'upwork') ? 'upwork' : 'linkedin',
          label: body.profile?.fullName?.trim() || channels[0].identityName.trim(),
          full_name: body.profile?.fullName?.trim() || null,
          current_role: body.profile?.title?.trim() || null,
          professional_summary: body.profile?.summary?.trim() || null,
          primary_skills: body.profile?.skills ?? [],
          profile_url: body.profile?.profileUrl?.trim() || null,
          headline: body.profile?.headline?.trim() || body.profile?.title?.trim() || null,
        })
        .select('*')
        .single()
      if (error) throw error
      result.profileId = profile.id as string
    } catch {
      result.status = 'failed'
      result.failed = 'profile'
      result.errors.push('Could not create the profile.')
      return NextResponse.json(result)
    }
  }

  // 2. One channel identity per selected channel.
  for (const channel of channels) {
    try {
      const base = slugify(channel.identityName)
      let slug = `${base}-${channel.channel}`
      const { data: existing } = await supabase
        .from('revenue_identities')
        .select('id')
        .eq('organization_id', ctx.orgId)
        .eq('slug', slug)
        .maybeSingle()
      if (existing) slug = `${base}-${channel.channel}-${Date.now().toString(36)}`

      const { data: identity, error } = await supabase
        .from('revenue_identities')
        .insert({
          organization_id: ctx.orgId,
          slug,
          identity_name: channel.identityName.trim(),
          channel: channel.channel,
          title: channel.title?.trim() || null,
          profile_id: result.profileId,
          status: 'active',
          source_kind: 'manual',
        })
        .select('*')
        .single()
      if (error) throw error
      result.identities.push({
        id: identity.id as string,
        channel: identity.channel as string,
        identityName: identity.identity_name as string,
      })
    } catch {
      result.errors.push(`Could not create the ${channel.channel} identity.`)
    }
  }

  if (result.identities.length === 0) {
    result.status = 'failed'
    result.failed = 'identities'
    return NextResponse.json(result)
  }

  // 3. Assign every created identity to the rep as PRIMARY. The canonical
  //    assignment also installs the execution row and the default target pack,
  //    so a fresh profile is workable immediately — no manual coverage step.
  for (const identity of result.identities) {
    try {
      await assignPrimaryResponsibility(supabase, {
        orgId: ctx.orgId,
        identityId: identity.id,
        repId,
        actorRepId: ctx.repId,
        ensureTargets: true,
      })
      result.assignments.push({ repId, identityId: identity.id })
    } catch (error) {
      result.errors.push(
        error instanceof Error && error.message === 'IDENTITY_HAS_NO_PROFILE'
          ? `Could not assign the ${identity.channel} identity: no linked person.`
          : `Could not assign the ${identity.channel} identity.`,
      )
    }
  }

  if (result.assignments.length < result.identities.length) {
    result.status = 'partial'
    result.failed = 'assign'
  }

  return NextResponse.json(result)
}
