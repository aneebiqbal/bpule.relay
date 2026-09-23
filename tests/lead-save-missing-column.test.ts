import { describe, expect, it } from 'vitest'
import type { Organization, Rep } from '@/lib/domain/types'
import { SupabaseStore } from '@/lib/store/supabase-store'

/**
 * Create lead used to call insert().select(LEAD_COLUMNS) as one statement.
 * A missing optional column (intelligence_input_hash, locked_until, …) makes
 * Postgres roll that INSERT back, so the button reported failure and no row
 * was saved. The insert must commit on `id` alone, then read the row back.
 */
describe('createLead survives a missing optional column', () => {
  it('commits the insert and reads the row back without the missing column', async () => {
    const inserts: Array<{ columns: string }> = []
    const readbacks: string[] = []
    const saved = {
      id: 'lead-new',
      organization_id: 'org-1',
      owner_rep_id: 'rep-1',
      company: 'Northwind',
      company_key: 'northwind',
      status: 'new',
      created_at: new Date().toISOString(),
    }

    const client = {
      from(table: string) {
        const state = { mode: 'select' as 'select' | 'insert', columns: '' }
        const finishList = () => {
          if (table !== 'leads') return { data: null, error: { message: 'skip' } }
          return { data: [], error: null }
        }
        const finishSingle = () => {
          if (table !== 'leads') return { data: null, error: { message: 'skip' } }
          if (state.mode === 'insert') {
            inserts.push({ columns: state.columns })
            if (state.columns.includes('intelligence_input_hash')) {
              return {
                data: null,
                error: { code: '42703', message: 'column leads.intelligence_input_hash does not exist' },
              }
            }
            return { data: { id: saved.id }, error: null }
          }
          readbacks.push(state.columns)
          if (state.columns.includes('intelligence_input_hash')) {
            return {
              data: null,
              error: {
                code: 'PGRST204',
                message: "Could not find the 'intelligence_input_hash' column of 'leads' in the schema cache",
              },
            }
          }
          if (state.columns.includes('title_raw')) return { data: saved, error: null }
          return { data: null, error: { message: 'unexpected select' } }
        }
        const chain: Record<string, unknown> = {}
        const self = () => chain
        chain.select = (columns: string) => {
          state.columns = columns
          return chain
        }
        chain.insert = () => {
          state.mode = 'insert'
          return chain
        }
        chain.update = self
        chain.order = self
        chain.eq = self
        chain.limit = self
        chain.single = () => Promise.resolve(finishSingle())
        chain.maybeSingle = () => Promise.resolve(finishSingle())
        chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(finishList()).then(onFulfilled, onRejected)
        return chain
      },
      rpc: async () => ({ data: null, error: { message: 'skip' } }),
    }

    const rep: Rep = {
      id: 'rep-1',
      name: 'Rep',
      role: 'admin',
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
    const result = await store.createLead({ company: 'Northwind' })

    expect(result.blocked).toBe(false)
    expect(result.lead?.id).toBe('lead-new')
    expect(result.lead?.company).toBe('Northwind')
    expect(inserts).toEqual([{ columns: 'id' }])
    expect(readbacks.some((columns) => columns.includes('intelligence_input_hash'))).toBe(true)
    expect(readbacks.some((columns) => columns.includes('title_raw') && !columns.includes('intelligence_input_hash'))).toBe(true)
  })
})
