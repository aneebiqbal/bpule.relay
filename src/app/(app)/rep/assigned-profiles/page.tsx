import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { AssignedProfilesView } from '@/components/assigned-profiles'

export const dynamic = 'force-dynamic'

export default async function AssignedProfilesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="space-y-8">
      <header className="reveal-up space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Your Relay</p>
        <h1 className="text-3xl font-medium tracking-tight text-ink sm:text-4xl">Assigned Profiles</h1>
        <p className="max-w-xl text-sm leading-relaxed text-slate">
          The revenue identities your admin has assigned to you. You execute from these profiles — the company truth is controlled by your admin.
        </p>
      </header>
      <AssignedProfilesView />
    </div>
  )
}
