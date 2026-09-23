import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { ManagerDrillDown, ManagerDrillDownSkeleton } from '@/components/rep/manager-drilldown'
import { leadScore, leadStatusLabel } from '@/lib/admin/team-live'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ repId: string }>
}

async function loadDrillDownData(repId: string) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (!authCtx) redirect('/login')

  const store = await createScoutStore()

  if (!authCtx.isOwner && !authCtx.isAdmin && authCtx.repId !== repId) {
    const teamMemberChecks = await Promise.all(
      authCtx.managedTeamIds.map(async (teamId) => {
        const members = await store.getTeamMembers(teamId)
        return members.some((m) => m.repId === repId)
      })
    )
    if (!teamMemberChecks.some(Boolean)) {
      redirect('/dashboard')
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  const teamMembers = await Promise.all(
    authCtx.managedTeamIds.map(async (teamId) => {
      const members = await store.getTeamMembers(teamId)
      return members.filter((m) => m.repId === repId)
    })
  )

  const isTeamMember = teamMembers.flat().length > 0 || authCtx.repId === repId

  if (!isTeamMember && !authCtx.isOwner && !authCtx.isAdmin) {
    redirect('/dashboard')
  }

  const repInfo = await store.getRepInfo(repId)

  if (!repInfo) redirect('/dashboard')

  const [targets, assignments, supabase] = await Promise.all([
    store.getRepTodayAccountability(repId),
    store.getRepAssignments(repId),
    createServerSupabase(),
  ])

  const [{ data: openLeadRows }, { data: dayCloses }] = await Promise.all([
    supabase
      .from('leads')
      .select('id, company, contact_name, status, canonical_score, score')
      .eq('organization_id', authCtx.orgId)
      .eq('owner_rep_id', repId)
      .in('status', ['new', 'contacted', 'followed_up', 'replied'])
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('day_closes')
      .select('*')
      .eq('person_id', repId)
      .eq('date', today),
  ])

  // Load contracts for day closes
  const contractIds = [...new Set((dayCloses ?? []).map((dc: any) => dc.contract_id).filter(Boolean))]
  const { data: contracts } = contractIds.length > 0
    ? await supabase.from('revenue_identity_contracts').select('*').in('id', contractIds)
    : { data: [] }

  // Load identities for day closes
  const dcIdentityIds = [...new Set((dayCloses ?? []).map((dc: any) => dc.revenue_identity_id))]
  const { data: dcIdentities } = dcIdentityIds.length > 0
    ? await supabase.from('revenue_identities').select('id, identity_name, channel').in('id', dcIdentityIds)
    : { data: [] }

  // Load allocations
  const { data: allocations } = contractIds.length > 0
    ? await supabase.from('contract_allocations').select('*').in('contract_id', contractIds)
    : { data: [] }

  return {
    rep: {
      id: repInfo.id,
      name: repInfo.name,
      role: repInfo.role,
    },
    identities: (assignments ?? []).map((a: any) => ({
      assignmentId: a.id,
      revenueIdentityId: a.revenue_identity_id,
      identityName: a.identity?.identity_name ?? 'Unknown',
      title: a.identity?.title ?? null,
      channel: a.identity?.channel ?? 'other',
    })),
    targets: targets.assignedIdentities,
    today,
    isManager: authCtx.isManager,
    managedTeamIds: authCtx.managedTeamIds,
    openLeads: (openLeadRows ?? []).map((lead) => ({
      id: lead.id as string,
      company: (lead.company as string | null)?.trim() || 'Untitled company',
      contactName: (lead.contact_name as string | null)?.trim() || null,
      statusLabel: leadStatusLabel(lead.status as string | null),
      score: leadScore({ canonical_score: lead.canonical_score as number | null, score: lead.score as number | null }),
    })),
    // Accountability OS data
    dayCloses: (dayCloses ?? []).map((dc: any) => {
      const contract = (contracts ?? []).find((c: any) => c.id === dc.contract_id)
      const identity = (dcIdentities ?? []).find((i: any) => i.id === dc.revenue_identity_id)
      const myAlloc = (allocations ?? []).find((a: any) => a.contract_id === dc.contract_id && a.person_id === repId)
      const pct = (myAlloc?.allocation_pct ?? ((allocations ?? []).filter((a: any) => a.contract_id === dc.contract_id).length === 0 ? 100 : 0)) / 100
      const snap = (dc.completion_snapshot ?? {}) as Record<string, number>
      return {
        identityId: dc.revenue_identity_id,
        identityName: identity?.identity_name ?? 'Unknown',
        channel: identity?.channel ?? 'other',
        status: dc.status,
        exceptionReason: dc.exception_reason,
        allocationPct: Math.round(pct * 100),
        progress: {
          connections: { completed: snap.connections ?? 0, target: Math.round((contract?.connections ?? 0) * pct), remaining: Math.max(0, Math.round((contract?.connections ?? 0) * pct) - (snap.connections ?? 0)) },
          firstDms: { completed: snap.firstDms ?? 0, target: Math.round((contract?.first_dms ?? 0) * pct), remaining: Math.max(0, Math.round((contract?.first_dms ?? 0) * pct) - (snap.firstDms ?? 0)) },
          emails: { completed: snap.emails ?? 0, target: Math.round((contract?.emails ?? 0) * pct), remaining: Math.max(0, Math.round((contract?.emails ?? 0) * pct) - (snap.emails ?? 0)) },
          followups: { completed: snap.followups ?? 0, target: Math.round((contract?.followups ?? 0) * pct), remaining: Math.max(0, Math.round((contract?.followups ?? 0) * pct) - (snap.followups ?? 0)) },
        },
        dayCloseStatus: dc.status,
      }
    }),
  }
}

export default async function ManagerDrillDownPage({ params }: PageProps) {
  const { repId } = await params
  const dataPromise = loadDrillDownData(repId)

  return (
    <Suspense fallback={<ManagerDrillDownSkeleton />}>
      <ManagerDrillDown dataPromise={dataPromise} />
    </Suspense>
  )
}
