import { createScoutStore } from '@/lib/store'
import { ProfilesManager } from '@/components/profiles-manager'

export const dynamic = 'force-dynamic'

export default async function ProfilesPage() {
  const store = await createScoutStore()
  const profiles = await store.listProfiles()

  return (
    <div className="space-y-6">
      <ProfilesManager initialProfiles={profiles} />
    </div>
  )
}