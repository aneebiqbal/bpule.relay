import type { Rep } from '@/lib/domain/types'
import type { ScoutStore } from '@/lib/store/types'
import { buildMockStore } from '@/lib/store/mock-store'

// Demo mode keeps one in-process store per rep so the queue, drafts, and
// voice profiles persist across requests for the local dev server. This lives
// in its own module so both getCurrentUser and createScoutStore can reach it
// without a circular import.
const demoStores = new Map<string, ScoutStore>()

export function getDemoStore(rep: Rep): ScoutStore {
  let store = demoStores.get(rep.id)
  if (store) return store
  store = buildMockStore({ rep, mode: 'demo' })
  demoStores.set(rep.id, store)
  return store
}