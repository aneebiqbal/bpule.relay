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

  const [reps, profiles] = await Promise.all([
    store.listAllReps(),
    store.listAllProfiles(),
  ])

  return (
    <div className="space-y-8">
      <header className="reveal-up space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Administration</p>
        <h1 className="text-3xl font-medium tracking-tight text-ink sm:text-4xl">Manage Profiles</h1>
        <p className="max-w-xl text-sm leading-relaxed text-slate">
          {isAdmin
            ? 'Every rep\'s identities and proof items in one place. Real client names, CVs, and project history are shared business data, edited here deliberately rather than by whoever is logged in.'
            : 'A read-only view of every rep\'s identities and proof items, for reference. Only an admin can add, edit, or remove this data.'}
        </p>
      </header>

      <ManageProfiles
        initialReps={reps}
        initialProfiles={profiles}
        isAdmin={isAdmin}
        currentRepId={user.rep.id}
      />
    </div>
  )
}
