import { createScoutStore } from '@/lib/store'
import { ProfilesManager } from '@/components/profiles-manager'


export const dynamic = 'force-dynamic'

export default async function ProfilesPage() {
  const store = await createScoutStore()
  const profiles = await store.listProfiles()

  return (
    <div className="space-y-8">
      <header className="reveal-up space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Identities</p>
        <h1 className="text-3xl font-medium tracking-tight text-ink sm:text-4xl">Profiles</h1>
        <p className="max-w-xl text-sm leading-relaxed text-slate">
          The identities you write from, per platform, plus the past projects each one can cite.
          Proof items are matched to leads by tag overlap in code, never by a model call at draft
          time. A client name only surfaces when permission is on file.
        </p>
      </header>
      <ProfilesManager initialProfiles={profiles} />
    </div>
  )
}
