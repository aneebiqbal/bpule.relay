type Row = Record<string, any>

type FilterOp = 'eq' | 'neq' | 'gte' | 'lt'

interface Filter {
  field: string
  op: FilterOp
  value: any
}

interface OrFilter {
  field: string
  op: 'eq' | 'is'
  value: string
}

interface FakeState {
  tables: Record<string, Row[]>
  idCounter: number
  rpcCalls: Array<{ fn: string; args: Record<string, unknown> | null }>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

function parseColumns(columns: string | undefined): string[] | null {
  if (!columns || columns.trim() === '*') return null
  return columns.split(',').map((c) => c.trim()).filter(Boolean)
}

function applyProjection(rows: Row[], columns: string | undefined): Row[] {
  const fields = parseColumns(columns)
  if (!fields) return rows.map((row) => ({ ...row }))
  return rows.map((row) => {
    const out: Row = {}
    for (const field of fields) out[field] = row[field]
    return out
  })
}

function computeGeneratedColumns(table: string, row: Row): Row {
  const next = { ...row }
  if (table === 'contact_points') {
    next.value_key = String(next.value ?? '').trim().toLowerCase()
  }
  if (table === 'email_suppressions') {
    next.email_key = String(next.email ?? '').trim().toLowerCase()
  }
  return next
}

function parseOrFilters(expression: string): OrFilter[] {
  return expression
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^([^\.]+)\.(eq|is)\.(.+)$/.exec(part)
      if (!match) return null
      return {
        field: match[1],
        op: match[2] as 'eq' | 'is',
        value: match[3],
      }
    })
    .filter((v): v is OrFilter => v !== null)
}

class FakeQueryBuilder implements PromiseLike<{ data: any; error: Error | null; count?: number | null }> {
  private action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | null = null
  private selectColumns: string | undefined = '*'
  private selectOptions: Record<string, any> = {}
  private payloadRows: Row[] = []
  private updatePatch: Row = {}
  private upsertOnConflict: string | null = null
  private filters: Filter[] = []
  private orFilters: OrFilter[] = []
  private orderBy: Array<{ field: string; ascending: boolean }> = []
  private rowLimit: number | null = null
  private returning = false

  constructor(private readonly state: FakeState, private readonly table: string) {}

  select(columns = '*', options: Record<string, any> = {}) {
    this.selectColumns = columns
    this.selectOptions = options
    this.returning = true
    if (!this.action) this.action = 'select'
    return this
  }

  insert(rows: Row | Row[]) {
    this.action = 'insert'
    this.payloadRows = toArray(rows)
    return this
  }

  update(patch: Row) {
    this.action = 'update'
    this.updatePatch = patch
    return this
  }

  upsert(rows: Row | Row[], options?: { onConflict?: string }) {
    this.action = 'upsert'
    this.payloadRows = toArray(rows)
    this.upsertOnConflict = options?.onConflict ?? null
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  eq(field: string, value: any) {
    this.filters.push({ field, op: 'eq', value })
    return this
  }

  neq(field: string, value: any) {
    this.filters.push({ field, op: 'neq', value })
    return this
  }

  gte(field: string, value: any) {
    this.filters.push({ field, op: 'gte', value })
    return this
  }

  lt(field: string, value: any) {
    this.filters.push({ field, op: 'lt', value })
    return this
  }

  or(expression: string) {
    this.orFilters = parseOrFilters(expression)
    return this
  }

  order(field: string, opts?: { ascending?: boolean }) {
    this.orderBy.push({ field, ascending: opts?.ascending !== false })
    return this
  }

  limit(value: number) {
    this.rowLimit = value
    return this
  }

  async maybeSingle() {
    const result = await this.execute()
    if (result.error) return { data: null, error: result.error }
    const rows = Array.isArray(result.data) ? result.data : []
    return { data: rows[0] ?? null, error: null }
  }

  async single() {
    const result = await this.execute()
    if (result.error) return { data: null, error: result.error }
    const rows = Array.isArray(result.data) ? result.data : []
    if (rows.length !== 1) {
      return { data: null, error: new Error(`Expected single row, got ${rows.length}`) }
    }
    return { data: rows[0], error: null }
  }

  then<TResult1 = { data: any; error: Error | null; count?: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: Error | null; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private getTable(): Row[] {
    if (!this.state.tables[this.table]) this.state.tables[this.table] = []
    return this.state.tables[this.table]
  }

  private rowMatches(row: Row): boolean {
    const base = this.filters.every((f) => {
      const value = row[f.field]
      if (f.op === 'eq') return value === f.value
      if (f.op === 'neq') return value !== f.value
      if (f.op === 'gte') return value >= f.value
      if (f.op === 'lt') return value < f.value
      return true
    })
    if (!base) return false
    if (this.orFilters.length === 0) return true
    return this.orFilters.some((f) => {
      if (f.op === 'eq') return String(row[f.field]) === f.value
      if (f.op === 'is' && f.value === 'null') return row[f.field] == null
      return false
    })
  }

  private applyFilters(rows: Row[]): Row[] {
    return rows.filter((row) => this.rowMatches(row))
  }

  private applyOrderAndLimit(rows: Row[]): Row[] {
    let out = [...rows]
    for (const sort of this.orderBy) {
      out = out.sort((a, b) => {
        const av = a[sort.field]
        const bv = b[sort.field]
        if (av == null && bv == null) return 0
        if (av == null) return sort.ascending ? -1 : 1
        if (bv == null) return sort.ascending ? 1 : -1
        if (av < bv) return sort.ascending ? -1 : 1
        if (av > bv) return sort.ascending ? 1 : -1
        return 0
      })
    }
    if (typeof this.rowLimit === 'number') out = out.slice(0, this.rowLimit)
    return out
  }

  private assignId(table: string): string {
    this.state.idCounter += 1
    return `${table}-${this.state.idCounter}`
  }

  private async execute(): Promise<{ data: any; error: Error | null; count?: number | null }> {
    const action = this.action ?? 'select'
    const table = this.getTable()

    if (action === 'select') {
      const filtered = this.applyFilters(table)
      const count = filtered.length
      const rows = this.applyOrderAndLimit(filtered)
      if (this.selectOptions.head === true) {
        return { data: null, error: null, count }
      }
      return {
        data: applyProjection(rows, this.selectColumns),
        error: null,
        count: this.selectOptions.count ? count : null,
      }
    }

    if (action === 'insert') {
      // Minimal, targeted unique-constraint simulation — just the one real
      // index this fake needs to exercise (messages_org_idempotency_key_idx,
      // scoped by organization_id+idempotency_key, NULL-excluded), not a
      // general constraint system. Lets tests reproduce the true-concurrency
      // race (two inserts with the same key) that markContacted()'s 23505
      // handling exists for.
      if (this.table === 'messages') {
        for (const row of this.payloadRows) {
          if (row.idempotency_key != null) {
            const clash = table.some(
              (existing) => existing.organization_id === row.organization_id && existing.idempotency_key === row.idempotency_key,
            )
            if (clash) {
              const conflictError = Object.assign(
                new Error('duplicate key value violates unique constraint "messages_org_idempotency_key_idx"'),
                { code: '23505' },
              )
              return { data: null, error: conflictError }
            }
          }
        }
      }
      const inserted = this.payloadRows.map((row) => {
        const next = computeGeneratedColumns(this.table, clone(row))
        if (!next.id) next.id = this.assignId(this.table)
        table.push(next)
        return next
      })
      return {
        data: this.returning ? applyProjection(inserted, this.selectColumns) : null,
        error: null,
      }
    }

    if (action === 'update') {
      const matched = this.applyFilters(table)
      for (const row of matched) {
        Object.assign(row, this.updatePatch)
        Object.assign(row, computeGeneratedColumns(this.table, row))
      }
      return {
        data: this.returning ? applyProjection(matched, this.selectColumns) : null,
        error: null,
      }
    }

    if (action === 'upsert') {
      const conflictFields = (this.upsertOnConflict ?? '').split(',').map((f) => f.trim()).filter(Boolean)
      const affected: Row[] = []
      for (const payload of this.payloadRows) {
        const next = computeGeneratedColumns(this.table, clone(payload))
        let existing: Row | undefined
        if (conflictFields.length > 0) {
          existing = table.find((row) => conflictFields.every((f) => row[f] === next[f]))
        }
        if (existing) {
          Object.assign(existing, next)
          Object.assign(existing, computeGeneratedColumns(this.table, existing))
          affected.push(existing)
        } else {
          if (!next.id) next.id = this.assignId(this.table)
          table.push(next)
          affected.push(next)
        }
      }
      return {
        data: this.returning ? applyProjection(affected, this.selectColumns) : null,
        error: null,
      }
    }

    if (action === 'delete') {
      const matched = this.applyFilters(table)
      this.state.tables[this.table] = table.filter((row) => !matched.includes(row))
      return {
        data: this.returning ? applyProjection(matched, this.selectColumns) : null,
        error: null,
      }
    }

    return { data: null, error: null }
  }
}

export function createFakeSupabase(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    identity_assignments: [],
    revenue_identities: [],
    contact_points: [],
    outreach_artifacts: [],
    prepared_email_drafts: [],
    email_messages: [],
    email_mailboxes: [],
    email_sending_policies: [],
    email_send_attempts: [],
    email_delivery_events: [],
    email_suppressions: [],
    leads: [],
    messages: [],
    outcomes: [],
    conversation_states: [],
    relay_events: [],
  }

  for (const [table, rows] of Object.entries(seed)) {
    tables[table] = (rows ?? []).map((row) => computeGeneratedColumns(table, clone(row)))
  }

  const state: FakeState = {
    tables,
    idCounter: 0,
    rpcCalls: [],
  }

  const client = {
    from(table: string) {
      return new FakeQueryBuilder(state, table)
    },
    async rpc(fn: string, args: Record<string, unknown> | null) {
      state.rpcCalls.push({ fn, args })
      if (fn === 'emit_relay_event' && args) {
        state.tables.relay_events.push({
          id: `relay-event-${state.rpcCalls.length}`,
          organization_id: args.p_org_id,
          event_type: args.p_event_type,
          entity_type: args.p_entity_type,
          entity_id: args.p_entity_id,
          payload: args.p_payload,
        })
      }
      return { data: null, error: null }
    },
  }

  return {
    client,
    tables,
    rpcCalls: state.rpcCalls,
  }
}
