import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { PeopleView } from '@/components/admin/people-view'
import { PeopleViewSkeleton } from '@/components/admin/people-view'

export const dynamic = 'force-dynamic'

async function loadPeopleData() {
  const authCtx = await getAuthContext()
  const store = await createScoutStore()

  const teams = await store.listTeams()
  const allReps = await store.listAllReps()

  const orgRoles = await store.getOrganizationRoles()
  const roleMap = new Map(orgRoles.map((r) => [r.personId, r.role]))

  const memberships = await store.getActiveTeamMemberships()

  const teamMap = new Map<string, string[]>()
  const memberTeamMap = new Map<string, string[]>()
  for (const m of memberships) {
    if (m.membershipRole === 'MANAGER') {
      const ids = teamMap.get(m.personId) ?? []
      ids.push(m.teamId)
      teamMap.set(m.personId, ids)
    } else {
      const ids = memberTeamMap.get(m.personId) ?? []
      ids.push(m.teamId)
      memberTeamMap.set(m.personId, ids)
    }
  }

  const people = allReps.map((rep) => ({
    id: rep.id,
    name: rep.name,
    role: roleMap.get(rep.id) ?? 'MEMBER',
    managedTeams: (teamMap.get(rep.id) ?? []).map((tid) => {
      const team = teams.find((t) => t.id === tid)
      return { id: tid, name: team?.name ?? 'Unknown' }
    }),
    memberTeams: (memberTeamMap.get(rep.id) ?? []).map((tid) => {
      const team = teams.find((t) => t.id === tid)
      return { id: tid, name: team?.name ?? 'Unknown' }
    }),
  }))

  const owners = people.filter((p) => p.role === 'OWNER')
  const admins = people.filter((p) => p.role === 'ADMIN')
  const managers = people.filter((p) => p.role === 'MANAGER')
  const members = people.filter((p) => p.role === 'MEMBER')

  return {
    orgName: authCtx?.orgName ?? 'Organization',
    teams,
    people,
    owners,
    admins,
    managers,
    members,
    isOwner: authCtx?.isOwner ?? false,
  }
}

export default async function PeoplePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (user.rep.role !== 'admin' && !authCtx?.isOwner && !authCtx?.isAdmin) {
    redirect('/dashboard')
  }

  const dataPromise = loadPeopleData()

  return (
    <Suspense fallback={<PeopleViewSkeleton />}>
      <PeopleView dataPromise={dataPromise} />
    </Suspense>
  )
}
