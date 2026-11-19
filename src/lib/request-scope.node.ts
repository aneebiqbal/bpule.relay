/**
 * Server-only request-scope backend.
 *
 * Imported for its side effect by the server auth/supabase entry points. Never
 * import this from a module a client component can reach: it pulls in
 * `node:async_hooks`, which Turbopack cannot place in a browser chunk.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { setRequestScopeStorage, type RequestScope } from './request-scope'

const storage = new AsyncLocalStorage<RequestScope>()

setRequestScopeStorage({
  getStore: () => storage.getStore(),
  run: (store, fn) => storage.run(store, fn),
  enterWith: (store) => storage.enterWith(store),
})
