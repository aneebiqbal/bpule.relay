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
    <div className="space-y-5">
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Admin / Profile Directory</p>
        <h1 className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">
          Centralize identity and proof records.
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--console-mute)]">
          {isAdmin
            ? 'Real client names, CVs, and project history are shared business assets. Edit them deliberately from this workspace.'
            : 'This workspace is read-only for non-admin roles. Admin controls all profile and proof changes.'}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <span className="rounded border border-orange/20 bg-orange/5 px-3 py-2 text-[12px] text-[color:var(--console-text)]">
            {reps.length} reps in directory
          </span>
          <span className="rounded border border-orange/20 bg-orange/5 px-3 py-2 text-[12px] text-[color:var(--console-text)]">
            {profiles.length} profiles tracked
          </span>
        </div>
      </section>

      <ManageProfiles
        initialReps={reps}
        initialProfiles={profiles}
        isAdmin={isAdmin}
        currentRepId={user.rep.id}
      />
    </div>
  )
}
