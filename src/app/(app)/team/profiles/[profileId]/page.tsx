import { notFound, redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { loadProfileOperatingModel } from '@/lib/profiles/operating-model'
import { loadCoveragePlan } from '@/lib/coverage/load'
import { TeamProfileDetailView } from '@/components/team/team-profile-detail'

export const dynamic = 'force-dynamic'

/**
 * Profile detail — ONE page per person.
 *
 * The route accepts either a canonical person key or one of its channel
 * profiles; the operating model resolves the person and unions every channel.
 */
export default async function TeamProfileDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  if (!ctx.isAdmin && !ctx.isManager) redirect('/dashboard')

  const { profileId } = await params

  const supabase = await createServerSupabase()
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('id, person_id')
    .eq('id', profileId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()

  // Directory keys for identities with no linked profile resolve to the profile
  // when one exists.
  let personKey = profileRow ? (profileRow.person_id ?? profileRow.id) : null
  if (!personKey && profileId.startsWith('identity:')) {
    const { data: identity } = await supabase
      .from('revenue_identities')
      .select('profile_id')
      .eq('id', profileId.slice('identity:'.length))
      .eq('organization_id', ctx.orgId)
      .maybeSingle()
    if (identity?.profile_id) {
      const { data: linked } = await supabase
        .from('profiles')
        .select('id, person_id')
        .eq('id', identity.profile_id)
        .eq('organization_id', ctx.orgId)
        .maybeSingle()
      personKey = linked ? (linked.person_id ?? linked.id) : identity.profile_id
    }
  }
  if (!personKey) notFound()

  const model = await loadProfileOperatingModel(ctx.orgId, personKey)
  if (!model) notFound()

  const { data: repRows } = await supabase
    .from('reps')
    .select('id, name')
    .eq('organization_id', ctx.orgId)
    .limit(2000)

  // Coverage actions are admin-only and need the derived plan; managers and reps
  // see the same channel status without paying for it.
  const canManage = ctx.isAdmin || ctx.isOwner
  const coverage = canManage ? await loadCoveragePlan(ctx.orgId) : null
  const coveragePending: Record<
    string,
    { kind: 'COVER' | 'RESTORE_PRIMARY'; fromRepName: string; toRepName: string; reason: string }
  > = {}
  for (const item of coverage?.requiresApproval ?? []) {
    coveragePending[item.profileId] = {
      kind: item.kind,
      fromRepName: item.fromRepName,
      toRepName: item.toRepName,
      reason: item.reason,
    }
  }
  const activeCoverage = (coverage?.profiles ?? [])
    .filter((profile) => profile.activeCoveringRepId)
    .map((profile) => profile.profileId)

  return (
    <TeamProfileDetailView
      model={model}
      canManage={canManage}
      reps={(repRows ?? []).map((rep) => ({ id: rep.id, name: rep.name }))}
      coveragePending={coveragePending}
      activeCoverage={activeCoverage}
    />
  )
}
