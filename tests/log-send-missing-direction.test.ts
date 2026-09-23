import { describe, expect, it } from 'vitest'
import type { Organization, Rep } from '@/lib/domain/types'
import { SupabaseStore } from '@/lib/store/supabase-store'

/**
 * Live PostgREST rejects messages inserts that include `direction` until
 * 20261001000001_message_direction.sql is in the schema cache. Logging a
 * send must retry without that column instead of failing the rep.
 */
describe('markContacted survives a missing messages.direction column', () => {
  it('retries the insert without direction and still logs the send', async () => {
    const inserts: Array<Record<string, unknown>> = []

    const client = {
      from(table: string) {
        const state = { mode: 'select' as 'select' | 'insert' | 'update', payload: null as Record<string, unknown> | null, head: false }
        const chain: Record<string, unknown> = {}
        const self = () => chain
        chain.select = (_columns: string, opts?: { head?: boolean }) => {
          state.head = Boolean(opts?.head)
          return chain
        }
        chain.insert = (payload: Record<string, unknown>) => {
          state.mode = 'insert'
          state.payload = payload
          if (table === 'messages') inserts.push({ ...payload })
          return chain
        }
        chain.update = () => {
          state.mode = 'update'
          return chain
        }
        chain.delete = self
        chain.eq = self
        chain.neq = self
        chain.gte = self
        chain.lt = self
        chain.in = self
        chain.order = self
        chain.limit = self
        chain.maybeSingle = () => {
          if (table === 'leads') {
            return Promise.resolve({ data: { id: 'lead-1', status: 'new', verdict: 'research_more', locked_until: null }, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        }
        chain.single = () => {
          if (table === 'messages' && state.payload && 'direction' in state.payload) {
            return Promise.resolve({
              data: null,
              error: {
                code: 'PGRST204',
                message: "Could not find the 'direction' column of 'messages' in the schema cache",
              },
            })
          }
          return Promise.resolve({ data: { id: 'msg-1' }, error: null })
        }
        chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
          const value = state.head
            ? { count: 0, error: null, data: null }
            : { data: table === 'leads' ? [{ id: 'lead-1' }] : [], error: null }
          return Promise.resolve(value).then(onFulfilled, onRejected)
        }
        return chain
      },
      rpc: async () => ({ data: null, error: null }),
    }

    const rep: Rep = {
      id: 'rep-1',
      name: 'Rep',
      role: 'rep',
      organizationId: 'org-1',
      createdAt: new Date().toISOString(),
      timezone: 'UTC',
    }
    const organization: Organization = {
      id: 'org-1',
      name: 'Org',
      plan: 'active',
      billingCustomerId: null,
      timezone: 'UTC',
      workingDays: [1, 2, 3, 4, 5],
      holidays: [],
      createdAt: new Date().toISOString(),
    }

    const store = new SupabaseStore(rep, client as never, organization)
    const result = await store.markContacted('lead-1', 'Hello from Relay', 'dm')

    expect(result.allowed).toBe(true)
    expect(inserts[0]).toMatchObject({ direction: 'outbound' })
    expect(inserts[1]).toBeDefined()
    expect(inserts[1]).not.toHaveProperty('direction')
    expect(inserts[1]).toMatchObject({ lead_id: 'lead-1', type: 'dm', sent_text: 'Hello from Relay' })
  })
})