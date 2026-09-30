import { describe, expect, it } from 'vitest'
import { createEnrichmentRun, processNextEnrichmentSource } from '@/lib/profile-intelligence/enrichment-service'
import type { SourceExtractor } from '@/lib/profile-intelligence/enrichment-extract'

/**
 * Regression: re-uploading a file whose earlier extraction FAILED reused the
 * source row with its failed status, so the new run replayed the stale error
 * forever and never re-extracted (production showed the old 8s-timeout error
 * even after the timeout fix shipped).
 */

type Row = Record<string, any>

function fakeClient() {
  const tables: Record<string, Row[]> = {
    profiles: [{ id: 'p1', organization_id: 'org', archived_at: null, full_name: 'Hassan', current_role: null, company: null, primary_skills: [] }],
    profile_import_batches: [], profile_enrichment_runs: [], profile_sources: [],
    portfolio_projects: [], proof_cards: [], profile_reviews: [], profile_claims: [], profile_experience: [],
  }
  const files = new Map<string, Uint8Array>()
  let n = 0
  class Q {
    private f: Array<(r: Row) => boolean> = []
    private op: 'select' | 'update' | 'insert' = 'select'
    private payload: any
    private one = false
    private lim = Infinity
    constructor(private t: string) {}
    select() { return this }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this }
    update(p: any) { this.op = 'update'; this.payload = p; return this }
    eq(k: string, v: any) { this.f.push((r) => r[k] === v); return this }
    neq(k: string, v: any) { this.f.push((r) => r[k] !== v); return this }
    is(k: string, v: any) { this.f.push((r) => (r[k] ?? null) === v); return this }
    in(k: string, v: any[]) { this.f.push((r) => v.includes(r[k])); return this }
    order() { return this }
    limit(x: number) { this.lim = x; return this }
    single() { this.one = true; return this.run() }
    maybeSingle() { this.one = true; return this.run() }
    then(res: any, rej: any) { return this.run().then(res, rej) }
    private async run() {
      const rows = tables[this.t] ??= []
      if (this.op === 'insert') {
        const r = { id: `${this.t}-${++n}`, source_ids: [], ...this.payload }
        rows.push(r)
        return { data: this.one ? r : [r], error: null }
      }
      const hit = rows.filter((r) => this.f.every((f) => f(r))).slice(0, this.lim)
      if (this.op === 'update') hit.forEach((r) => Object.assign(r, this.payload))
      return { data: this.one ? hit[0] ?? null : hit, error: null }
    }
  }
  return {
    tables,
    from: (t: string) => new Q(t),
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array) => { files.set(path, bytes); return { error: null } },
        download: async (path: string) => {
          const b = files.get(path)
          return b ? { data: new Blob([new Uint8Array(b)]), error: null } : { data: null, error: { message: 'missing' } }
        },
      }),
    },
  } as any
}

const file = { name: 'Hassan resume .pdf', type: 'application/pdf', bytes: new TextEncoder().encode('%PDF fake resume bytes') }

async function drain(client: any, runId: string, extractor: SourceExtractor) {
  let step = await processNextEnrichmentSource(client, { orgId: 'org', runId, extractor })
  let guard = 0
  while (!step.done && guard++ < 10) step = await processNextEnrichmentSource(client, { orgId: 'org', runId, extractor })
  return step.run
}

describe('re-uploading a file whose earlier extraction failed', () => {
  it('re-extracts it instead of replaying the old error, without duplicating the source', async () => {
    const client = fakeClient()
    const failing: SourceExtractor = async () => { throw new Error('All providers failed: openai/gpt-4o-mini: This operation was aborted') }
    let calls = 0
    const working: SourceExtractor = async (input) => {
      calls++
      return {
        extraction: {
          sourceId: input.sourceId, filename: input.filename, fingerprint: input.fingerprint, extractedAt: new Date().toISOString(),
          isSpreadsheet: false, reviews: [],
          people: [{ name: 'Hassan', facts: { fullName: 'Hassan', location: 'Lahore', primarySkills: ['Terraform'] } as any, projects: [], proofs: [] }],
        },
        parsedContent: 'text', pageCount: 1,
      }
    }

    const first = await createEnrichmentRun(client, { orgId: 'org', profileId: 'p1', actorRepId: 'rep', files: [file] })
    const failedRun = await drain(client, first.run.id, failing)
    expect(failedRun.status).toBe('failed')
    expect(failedRun.error_message).toMatch(/aborted/)

    const second = await createEnrichmentRun(client, { orgId: 'org', profileId: 'p1', actorRepId: 'rep', files: [file] })
    expect(second.sourceIds).toEqual(first.sourceIds) // same source row reused, no duplicate
    const run = await drain(client, second.run.id, working)

    expect(calls).toBe(1) // extraction actually ran again
    expect(run.status).toBe('proposed')
    expect(run.error_message).toBeNull()
    expect(run.proposal.changes.some((c: any) => c.field === 'location' && c.incomingValue === 'Lahore')).toBe(true)
    expect(client.tables.profile_sources).toHaveLength(1)
  })

  it('still reuses a SUCCESSFUL cached extraction without re-running AI', async () => {
    const client = fakeClient()
    let calls = 0
    const working: SourceExtractor = async (input) => {
      calls++
      return {
        extraction: { sourceId: input.sourceId, filename: input.filename, fingerprint: input.fingerprint, extractedAt: '', isSpreadsheet: false, reviews: [], people: [] },
        parsedContent: 'text', pageCount: 1,
      }
    }
    const first = await createEnrichmentRun(client, { orgId: 'org', profileId: 'p1', actorRepId: 'rep', files: [file] })
    await drain(client, first.run.id, working)
    const second = await createEnrichmentRun(client, { orgId: 'org', profileId: 'p1', actorRepId: 'rep', files: [file] })
    await drain(client, second.run.id, working)
    expect(calls).toBe(1)
  })
})
