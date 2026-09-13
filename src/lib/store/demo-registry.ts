import type { Rep } from '@/lib/domain/types'
import type { ScoutStore } from '@/lib/store/types'
import { buildMockStore } from '@/lib/store/mock-store'

// Demo mode keeps one in-process store per rep so the queue, drafts, and
// voice profiles persist across requests for the local dev server. This lives
// in its own module so both getCurrentUser and createScoutStore can reach it
// without a circular import.
//
// Stashed on globalThis (not just a module-level const) because Next.js dev
// (Turbopack) compiles Route Handlers and Server Components as separate
// module graphs — a plain module-level Map ends up as two different
// instances between an API route and a page, so a persona created via one
// would silently vanish when the other read it back. globalThis is the one
// thing both graphs actually share within the same server process.
const registryKey = Symbol.for('scout.demoStores')

function getRegistry(): Map<string, ScoutStore> {
  const g = globalThis as unknown as { [registryKey]?: Map<string, ScoutStore> }
  if (!g[registryKey]) g[registryKey] = new Map()
  return g[registryKey]
}

export function getDemoStore(rep: Rep): ScoutStore {
  const demoStores = getRegistry()
  let store = demoStores.get(rep.id)
  if (store) return store
  store = buildMockStore({ rep, mode: 'demo' })
  demoStores.set(rep.id, store)
  return store
}