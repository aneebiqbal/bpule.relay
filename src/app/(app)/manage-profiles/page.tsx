import { redirect } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { ManageProfiles } from '@/components/manage-profiles'

export const dynamic = 'force-dynamic'

export default async function ManageProfilesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const isAdmin = user.rep.role === 'admin'

  // Reading every rep's profiles is open to any authenticated rep (same as
  // the RLS select policy) so a rep can reference what proof exists; only
  // the write paths (upsert/delete) are admin-gated, both here and in the
  // API routes the client component calls.
  const [reps, profiles] = await Promise.all([
    store.listAllReps(),
    store.listAllProfiles(),
  ])

  return (
    <div className="space-y-6">
      <ManageProfiles
        initialReps={reps}
        initialProfiles={profiles}
        isAdmin={isAdmin}
        currentRepId={user.rep.id}
      />
    </div>
  )
}
