import { notFound, redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { loadTeamProfileDetail } from '@/lib/team/profile-detail'
import { TeamProfileDetailView } from '@/components/team/team-profile-detail'

export const dynamic = 'force-dynamic'

export default async function TeamProfileDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/login')
  if (!ctx.isAdmin && !ctx.isManager) redirect('/dashboard')

  const { profileId } = await params

  let detail = await loadTeamProfileDetail(ctx.orgId, profileId)
  if (!detail && profileId.startsWith('identity:')) {
    // Directory keys for identities with no linked profile resolve to the
    // profile when one exists.
    const supabase = await createServerSupabase()
    const { data: identity } = await supabase
      .from('revenue_identities')
      .select('profile_id')
      .eq('id', profileId.slice('identity:'.length))
      .eq('organization_id', ctx.orgId)
      .maybeSingle()
    if (identity?.profile_id) detail = await loadTeamProfileDetail(ctx.orgId, identity.profile_id)
  }
  if (!detail) notFound()

  const supabase = await createServerSupabase()
  const { data: repRows } = await supabase
    .from('reps')
    .select('id, name')
    .eq('organization_id', ctx.orgId)
    .limit(2000)

  return (
    <TeamProfileDetailView
      detail={detail}
      canManage={ctx.isAdmin || ctx.isOwner}
      reps={(repRows ?? []).map((rep) => ({ id: rep.id, name: rep.name }))}
    />
  )
}
