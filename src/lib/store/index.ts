import type { ScoutStore } from '@/lib/store/types'
import { SupabaseStore } from '@/lib/store/supabase-store'
import { getDemoStore } from '@/lib/store/demo-registry'
import { isDemoMode } from '@/lib/ai/config'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'

export async function createScoutStore(): Promise<ScoutStore> {
  const user = await getCurrentUser()
  if (!user) throw new Error('No signed-in rep for this request')

  if (isDemoMode()) {
    return getDemoStore(user.rep)
  }

  const client = await createServerSupabase()
  return new SupabaseStore(user.rep, client, user.organization)
}

export { getCurrentUser }
