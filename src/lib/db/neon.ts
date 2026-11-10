/**
 * Neon implementation of the canonical database contract.
 *
 * Two things make RLS work here, and both are load-bearing:
 *
 *  1. Identity travels in the `app.current_user_id` session GUC. The
 *     compatibility functions in the `auth` schema read it (falling back to
 *     `request.jwt.claims->>'sub'`), so every policy behaves exactly as it did
 *     under Supabase. The browser never supplies an organization id.
 *
 *  2. Reads set that GUC inside the same round trip, using a `LATERAL` join so
 *     Postgres must evaluate the `set_config` before the table scan — verified
 *     against a live RLS policy. Writes use a short transaction with
 *     `SET LOCAL` because their policies are evaluated during the target scan.
 *
 * Nothing here trusts a table name or column name from the browser: identifiers
 * are quoted and validated against `[A-Za-z_][A-Za-z0-9_]*`.
 */
import { Pool, types as neonTypes } from '@neondatabase/serverless'
import type {
  CountStrategy,
  DbSingleResult,
  DbClient,
  DbQueryBuilder,
  DbResult,
  OrderOptions,
  SelectOptions,
  UpsertOptions,
} from './types'

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * A Neon/pg client that fails while connecting or idle emits an `error` event.
 * pg attaches its idle-client listener only after `connect()` resolves, so a
 * failure before that point has no listener and would surface as an
 * `uncaughtException`. Attach a pool-level listener: the query still rejects,
 * so callers see the failure, but the server keeps serving.
 */
const reportedPoolErrors = new Set<string>()

function logPoolError(label: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  const key = `${label}:${message}`
  if (reportedPoolErrors.has(key)) return
  reportedPoolErrors.add(key)
  console.error(`[db] ${label} client error (degraded): ${message}`)
}

/** Wires pool-level error handling. Must be called before the pool is used. */
export function attachPoolErrorHandling(pool: Pool, label: string): Pool {
  pool.on('error', (err: unknown) => logPoolError(label, err))
  return pool
}

/** Query-level timing, off unless `RELAY_PERF_TRACE=1`. */
const TRACE_QUERIES = process.env.RELAY_PERF_TRACE === '1'

function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Refusing to quote suspicious identifier: ${name}`)
  return `"${name}"`
}

/**
 * Normalize a thrown driver error into the `DbError` the contract promises.
 * Postgres errors carry a `code` (42P01, 42703, ...); Neon wraps them in a plain
 * `Error`, so callers that branch on the code get it when the driver does.
 */
function toDbError(reason: unknown): { message: string; code?: string } {
  const err = reason as { message?: string; code?: string }
  const message = err?.message ?? String(reason)
  return typeof err?.code === 'string' ? { message, code: err.code } : { message }
}

const DATE_TYPE = 1082
const TIMESTAMP_TYPE = 1114
const TIMESTAMPTZ_TYPE = 1184

/**
 * The driver parses temporal columns into JS `Date` objects, while PostgREST
 * emits their text form. Returning the raw text keeps both providers
 * interchangeable and leaves DATE columns as plain `YYYY-MM-DD`.
 */
export function neonTypeParser(id: number, format?: 'text' | 'binary'): (value: string) => unknown {
  if (id === DATE_TYPE || id === TIMESTAMP_TYPE || id === TIMESTAMPTZ_TYPE) {
    return (value) => value
  }
  return neonTypes.getTypeParser(id, format)
}

/**
 * Translate a PostgREST select expression into SQL.
 *
 * PostgREST allows two things plain SQL does not:
 *
 *   - a JSON path alias: `alias:column->key` or `alias:column->>key`
 *   - a table embed: `alias:table(cols)`
 *
 * Embeds are not expressible in a single SELECT, so this only handles the JSON
 * path form and leaves the rest for the caller to resolve as a second read.
 */
function translateSelect(columns: string): string {
  return columns
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(':')
      if (colon < 0) return part

      const alias = part.slice(0, colon).trim()
      const expression = part.slice(colon + 1).trim()

      // `alias:table(cols)` is a table embed — not translatable here.
      const embed = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(expression)
      if (embed) return part

      // `alias:column->key` / `alias:column->>key` — a JSON path.
      const json = /^([A-Za-z_][A-Za-z0-9_]*)\s*(->>?)\s*([A-Za-z_][A-Za-z0-9_]*)$/.exec(expression)
      if (json) {
        const [, column, , key] = json
        // `->` returns jsonb, `->>` returns text; PostgREST's text form is the
        // one that matters for the app's display fields.
        return `(${ident(column)}->>'${key.replace(/'/g, "''")}') AS ${ident(alias)}`
      }

      return part
    })
    .join(', ')
}

/**
 * Low-level executor: runs SQL with the caller's identity in scope.
 *
 * Reads set the identity inside the same round trip (a `LATERAL` join forces
 * Postgres to evaluate the `set_config` before the table scan), so no connection
 * is held between calls. Writes run in a short transaction with `SET LOCAL`,
 * because their RLS policies are evaluated during the target scan.
 */
export interface NeonExecutorApi {
  /** Single round trip for reads; identity is set via a LATERAL join. */
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>
  /** Transaction for writes; identity is set with SET LOCAL. */
  queryInWrite<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>
}

let pool: Pool | null = null
let servicePool: Pool | null = null

export function getNeonPool(): Pool {
  if (pool) return pool
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not configured for the Neon provider')
  pool = attachPoolErrorHandling(
    new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      types: { getTypeParser: (id, format) => neonTypeParser(id, format) },
    }),
    'neon',
  )
  return pool
}

/**
 * The service pool. Falls back to `DATABASE_URL`, but a deployment that points
 * `DATABASE_URL` at a least-privilege role (`relay_app`) must set
 * `SERVICE_DATABASE_URL` to the owner URL — the service client relies on the
 * owner's RLS bypass for scheduled jobs and signed callbacks.
 */
export function getNeonServicePool(): Pool {
  if (servicePool) return servicePool
  const url = process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not configured for the Neon provider')
  servicePool = attachPoolErrorHandling(
    new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      types: { getTypeParser: (id, format) => neonTypeParser(id, format) },
    }),
    'neon-service',
  )
  return servicePool
}

/** Closes the pools. Used by tests and graceful shutdown. */
export async function closeNeonPool(): Promise<void> {
  if (pool) await pool.end()
  if (servicePool) await servicePool.end()
  pool = null
  servicePool = null
}

export class NeonExecutorImpl implements NeonExecutorApi {
  readonly provider = 'neon' as const

  constructor(
    private readonly pool: Pool,
    private readonly userId: string | null,
  ) {}

  async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    // The RLS identity must be set before the statement's plan is built. A
    // LATERAL set_config can be evaluated before the GUC is set for some plans,
    // which silently returns zero rows; a transaction with SET LOCAL is the
    // only reliable ordering. The connection is held for the read only.
    let n = 0
    const rewritten = text.replace(/\?/g, () => `$${++n}`)
    const client = await this.pool.connect()
    const started = TRACE_QUERIES ? performance.now() : 0
    try {
      await client.query('BEGIN')
      if (this.userId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', this.userId])
      }
      let res
      try {
        res = await client.query(rewritten, values)
      } catch (error) {
        // Include the statement: a placeholder or quoting defect is otherwise
        // invisible behind Postgres' terse position marker.
        throw new Error(`Neon query failed: ${(error as Error).message}\n${rewritten}`)
      }
      await client.query('COMMIT')
      if (TRACE_QUERIES) {
        console.log(`[sql] ${Math.round(performance.now() - started)}ms ${rewritten.slice(0, 160)}`)
      }
      return res.rows as T[]
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  async queryInWrite<T>(text: string, values: unknown[] = []): Promise<T[]> {
    let n = 0
    const inner = text.replace(/\?/g, () => `$${++n}`)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      if (this.userId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', this.userId])
      }
      let res
      try {
        res = await client.query(inner, values)
      } catch (error) {
        throw new Error(`Neon write failed: ${(error as Error).message}\n${inner}`)
      }
      await client.query('COMMIT')
      return res.rows as T[]
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }
}

/**
 * Opens a Neon session bound to one authenticated user. Prefer
 * `new NeonDbClient(pool, userId)` for request-scoped use; this helper exists
 * for callers that want to wrap a whole unit of work in one connection.
 */
export async function withNeonSession<T>(
  userId: string,
  fn: (executor: NeonExecutorApi) => Promise<T>,
): Promise<T> {
  return fn(new NeonExecutorImpl(getNeonPool(), userId))
}

// ---------------------------------------------------------------------------
// PostgREST `or` filter strings
// ---------------------------------------------------------------------------

function splitTopLevel(input: string, sep = ','): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === sep && depth === 0) {
      out.push(input.slice(start, i))
      start = i + 1
    }
  }
  out.push(input.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

/**
 * Translates a PostgREST `or` filter string into SQL. Supports the operators
 * the app uses: eq, neq, gt, gte, lt, lte, like, ilike, is, in, cs, cd, and
 * `and(...)`/`or(...)` groups. Returns the SQL fragment and its params in order.
 */
function parseFilterString(filter: string, joiner = 'OR'): { sql: string; params: unknown[] } {
  const params: unknown[] = []
  const parts = splitTopLevel(filter).map((part) => {
    const grouped = /^(and|or)\((.*)\)$/.exec(part)
    if (grouped) {
      // A group keeps its own joiner and contributes its params in place, so
      // the outer placeholder order stays aligned with the bound values.
      const inner = parseFilterString(grouped[2], grouped[1].toUpperCase())
      params.push(...inner.params)
      return `(${inner.sql})`
    }
    const dot = part.indexOf('.')
    if (dot < 0) return part
    const column = part.slice(0, dot)
    const rest = part.slice(dot + 1)
    const opMatch = /^([a-zA-Z.]+)\.([\s\S]*)$/.exec(rest)
    const op = opMatch?.[1] ?? 'eq'
    const raw = opMatch?.[2] ?? ''
    const col = ident(column)
    const add = (v: unknown) => {
      params.push(v)
      return '?'
    }

    switch (op) {
      case 'eq':
        return `${col} = ${add(raw)}`
      case 'neq':
      case 'not.eq':
        return `${col} <> ${add(raw)}`
      case 'gt':
        return `${col} > ${add(raw)}`
      case 'gte':
        return `${col} >= ${add(raw)}`
      case 'lt':
        return `${col} < ${add(raw)}`
      case 'lte':
        return `${col} <= ${add(raw)}`
      case 'is': {
        if (raw === 'null') return `${col} IS NULL`
        if (raw === 'not.null') return `${col} IS NOT NULL`
        if (raw === 'true') return `${col} IS TRUE`
        if (raw === 'false') return `${col} IS FALSE`
        return `${col} = ${add(raw)}`
      }
      case 'like':
      case 'ilike':
        return `${col} ${op.toUpperCase()} ${add(raw.replace(/\*/g, '%'))}`
      case 'in': {
        const inner = raw.replace(/^\(|\)$/g, '')
        const vals = splitTopLevel(inner)
        return `${col} IN (${vals.map((v) => add(v)).join(', ')})`
      }
      case 'cs':
        return `${col} @> ${add(raw)}`
      case 'cd':
        return `${col} <@ ${add(raw)}`
      default:
        return `${col} = ${add(raw)}`
    }
  })
  return { sql: parts.join(` ${joiner} `), params }
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

class NeonQueryBuilder<T = Record<string, unknown>> implements DbQueryBuilder<T> {
  private columns = '*'
  private count?: CountStrategy
  private filters: string[] = []
  private filterParams: unknown[] = []
  private orders: string[] = []
  private limitValue?: number
  private offsetValue?: number
  private op: Op = 'select'
  private values?: unknown
  private upsertOptions?: UpsertOptions
  private returningRows = false
  private lastCount: number | null = null
  private headValue = false

  constructor(
    private readonly executor: NeonExecutorApi,
    private readonly table: string,
  ) {
    // Table and column names are quoted, so anything that is not a plain
    // identifier is refused rather than silently mangled.
    if (!IDENT.test(table)) throw new Error(`Refusing to quote suspicious identifier: ${table}`)
  }

  private param(value: unknown): string {
    this.filterParams.push(value)
    return '?'
  }

  select(columns?: string, opts?: SelectOptions): DbQueryBuilder<T> {
    // PostgREST returns the written rows when `.select()` follows a write.
    if (this.op !== 'select') this.returningRows = true
    this.columns = translateSelect((columns ?? '*').trim() || '*')
    this.count = opts?.count
    this.headValue = opts?.head === true
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push(`${ident(column)} = ${this.param(value)}`)
    return this
  }
  neq(column: string, value: unknown) {
    this.filters.push(`${ident(column)} <> ${this.param(value)}`)
    return this
  }
  gt(column: string, value: unknown) {
    this.filters.push(`${ident(column)} > ${this.param(value)}`)
    return this
  }
  gte(column: string, value: unknown) {
    this.filters.push(`${ident(column)} >= ${this.param(value)}`)
    return this
  }
  lt(column: string, value: unknown) {
    this.filters.push(`${ident(column)} < ${this.param(value)}`)
    return this
  }
  lte(column: string, value: unknown) {
    this.filters.push(`${ident(column)} <= ${this.param(value)}`)
    return this
  }
  is(column: string, value: unknown) {
    if (value === null) this.filters.push(`${ident(column)} IS NULL`)
    else if (value === true) this.filters.push(`${ident(column)} IS TRUE`)
    else if (value === false) this.filters.push(`${ident(column)} IS FALSE`)
    else this.filters.push(`${ident(column)} = ${this.param(value)}`)
    return this
  }
  in(column: string, values: readonly unknown[]) {
    if (!values.length) {
      this.filters.push('FALSE')
      return this
    }
    this.filters.push(`${ident(column)} IN (${values.map((v) => this.param(v)).join(', ')})`)
    return this
  }
  contains(column: string, value: unknown) {
    this.filters.push(`${ident(column)} @> ${this.param(value)}`)
    return this
  }
  or(filter: string) {
    const parsed = parseFilterString(filter)
    this.filters.push(`(${parsed.sql})`)
    this.filterParams.push(...parsed.params)
    return this
  }
  not(column: string, op: string, value: unknown) {
    const col = ident(column)
    const negate = (fragment: string) => (op === 'is' ? `NOT (${fragment})` : `NOT (${fragment})`)
    if (op === 'is') {
      const frag = value === null ? `${col} IS NULL` : value === true ? `${col} IS TRUE` : value === false ? `${col} IS FALSE` : `${col} = ?`
      this.filters.push(negate(frag))
      if (value !== null && value !== true && value !== false) this.filterParams.push(value)
      return this
    }
    if (op === 'in' && Array.isArray(value)) {
      // The list must expand into individual parameters; binding the array as
      // one value produces `IN $1`, which Postgres rejects.
      if (!value.length) {
        this.filters.push('TRUE')
        return this
      }
      this.filters.push(`NOT (${col} IN (${value.map((v) => this.param(v)).join(', ')}))`)
      return this
    }
    const opMap: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE' }
    const frag = `${col} ${opMap[op] ?? op.toUpperCase()} ?`
    this.filters.push(negate(frag))
    this.filterParams.push(value)
    return this
  }
  filter(column: string, op: string, value: unknown) {
    const col = ident(column)
    const opMap: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE' }
    const frag = `${col} ${opMap[op] ?? op.toUpperCase()} ?`
    this.filters.push(frag)
    this.filterParams.push(value)
    return this
  }
  ilike(column: string, pattern: string) {
    this.filters.push(`${ident(column)} ILIKE ?`)
    this.filterParams.push(pattern)
    return this
  }
  like(column: string, pattern: string) {
    this.filters.push(`${ident(column)} LIKE ?`)
    this.filterParams.push(pattern)
    return this
  }
  match(filter: Record<string, unknown>) {
    for (const [column, value] of Object.entries(filter)) {
      this.filters.push(`${ident(column)} = ?`)
      this.filterParams.push(value)
    }
    return this
  }
  order(column: string, opts?: OrderOptions) {
    const dir = opts?.ascending === false ? 'DESC' : 'ASC'
    const nulls = opts?.nullsFirst === undefined ? '' : opts.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST'
    this.orders.push(`${ident(column)} ${dir}${nulls}`)
    return this
  }
  limit(count: number) {
    this.limitValue = count
    return this
  }
  range(from: number, to: number) {
    this.offsetValue = from
    this.limitValue = to - from + 1
    return this
  }
  insert(values: unknown) {
    this.op = 'insert'
    this.values = values
    return this
  }
  update(values: unknown) {
    this.op = 'update'
    this.values = values
    return this
  }
  upsert(values: unknown, opts?: UpsertOptions) {
    this.op = 'upsert'
    this.values = values
    this.upsertOptions = opts
    return this
  }
  delete(_opts?: { count?: CountStrategy; returning?: boolean }) {
    this.op = 'delete'
    return this
  }

  /** PostgREST returns inserted/updated rows when the builder is followed by select(). */
  private wantsReturning(): boolean {
    return this.returningRows
  }

  async single(): Promise<DbSingleResult<T>> {
    let rows: T[]
    try {
      // PostgREST applies the query's own LIMIT before the object-shape check,
      // so `.limit(1).single()` returns one row rather than erroring on rows it
      // never asked for. Only impose limit(1) when the caller set none.
      if (this.limitValue === undefined) this.limit(1)
      rows = await this.run()
    } catch (err) {
      return { data: null, error: toDbError(err) }
    }
    if (rows.length === 0) return { data: null, error: { message: 'The result contains 0 rows' } }
    if (rows.length > 1) return { data: null, error: { message: 'The result contains more than 1 row' } }
    return { data: rows[0], error: null }
  }

  async maybeSingle(): Promise<DbSingleResult<T>> {
    let rows: T[]
    try {
      // Cap at 2 only when the caller left the limit open; an explicit
      // `.limit(1)` means "give me the first one", not "error if two exist".
      if (this.limitValue === undefined || this.limitValue > 2) this.limit(2)
      rows = await this.run()
    } catch (err) {
      return { data: null, error: toDbError(err) }
    }
    if (rows.length > 1) return { data: null, error: { message: 'The result contains more than 1 row' } }
    return { data: rows[0] ?? null, error: null }
  }

  then<TResult1 = DbResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const promise = this.run().then(
      (rows) => {
        const result: DbResult<T[]> = {
          data: rows,
          error: null,
          count: this.lastCount ?? null,
        }
        return onfulfilled ? onfulfilled(result) : (result as unknown as TResult1)
      },
      (reason) => {
        // PostgREST resolves a failed query with `{ data: null, error }`
        // rather than rejecting; the app's call sites check `.error`, so the
        // Neon adapter must not throw here. `await` supplies its own rejection
        // handler, so this branch must settle through `onfulfilled`.
        const failed: DbResult<T[]> = {
          data: null as unknown as T[],
          error: toDbError(reason),
          count: null,
        }
        if (onfulfilled) return onfulfilled(failed)
        return _onrejected ? _onrejected(reason) : (failed as unknown as TResult1)
      },
    )
    return promise as PromiseLike<TResult1 | TResult2>
  }

  private async run(): Promise<T[]> {
    const whereSql = this.filters.length ? ` WHERE ${this.filters.join(' AND ')}` : ''
    // ORDER BY / LIMIT / OFFSET are SELECT-only in PostgreSQL — an UPDATE or
    // DELETE carrying them is a syntax error. `.single()` sets limit(1), so a
    // write through the builder must not emit it; Postgres already returns
    // every matched row and single() still rejects more than one.
    const selectable = this.op === 'select'
    const orderSql = selectable && this.orders.length ? ` ORDER BY ${this.orders.join(', ')}` : ''
    const limitSql = selectable && this.limitValue !== undefined ? ` LIMIT ${this.limitValue}` : ''
    const offsetSql = selectable && this.offsetValue ? ` OFFSET ${this.offsetValue}` : ''
    const returningSql = this.wantsReturning() ? ' RETURNING *' : ''
    const headOnly = this.headValue === true

    // Params are collected in the order the `?` placeholders appear.
    const params: unknown[] = []
    let sql: string

    const pushFilterParams = () => params.push(...this.filterParams)

    switch (this.op) {
      case 'select':
        sql = `SELECT ${this.columns} FROM ${ident(this.table)}${whereSql}${orderSql}${limitSql}${offsetSql}`
        pushFilterParams()
        break

      case 'insert': {
        const rows = Array.isArray(this.values) ? this.values : [this.values]
        if (!rows.length || typeof rows[0] !== 'object') throw new Error('insert() requires an object or array')
        const cols = Object.keys(rows[0] as object)
        const tuples = rows.map((r) => {
          const obj = r as Record<string, unknown>
          params.push(...cols.map((c) => obj[c]))
          return `(${cols.map(() => '?').join(', ')})`
        })
        sql = `INSERT INTO ${ident(this.table)} (${cols.map(ident).join(', ')}) VALUES ${tuples.join(', ')}${returningSql}`
        break
      }

      case 'update': {
        const row = this.values
        if (!row || typeof row !== 'object') throw new Error('update() requires an object')
        const rowObj = row as Record<string, unknown>
        const cols = Object.keys(rowObj)
        params.push(...cols.map((c) => rowObj[c]))
        sql = `UPDATE ${ident(this.table)} SET ${cols.map((c) => `${ident(c)} = ?`).join(', ')}${whereSql}${orderSql}${limitSql}${offsetSql}${returningSql}`
        pushFilterParams()
        break
      }

      case 'upsert': {
        const rows = Array.isArray(this.values) ? this.values : [this.values]
        if (!rows.length || typeof rows[0] !== 'object') throw new Error('upsert() requires an object or array')
        const cols = Object.keys(rows[0] as object)
        const tuples = rows.map((r) => {
          const obj = r as Record<string, unknown>
          params.push(...cols.map((c) => obj[c]))
          return `(${cols.map(() => '?').join(', ')})`
        })
        let conflictSql = ''
        const conflict = this.upsertOptions?.onConflict
        if (this.upsertOptions?.ignoreDuplicates) conflictSql = ' ON CONFLICT DO NOTHING'
        else if (conflict) {
          const setSql = cols.map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`).join(', ')
          conflictSql = ` ON CONFLICT (${conflict.split(',').map((c) => ident(c.trim())).join(', ')}) DO UPDATE SET ${setSql}`
        }
        sql = `INSERT INTO ${ident(this.table)} (${cols.map(ident).join(', ')}) VALUES ${tuples.join(', ')}${conflictSql}${returningSql}`
        break
      }

      case 'delete':
        sql = `DELETE FROM ${ident(this.table)}${whereSql}${orderSql}${limitSql}${offsetSql}${returningSql}`
        pushFilterParams()
        break
    }

    // The builder emits `?` placeholders; the executor rewrites them to `$n`
    // and prepends the identity GUC, so parameter order stays in one place.
    if (this.op === 'select') {
      if (headOnly) {
        // PostgREST `head: true` fetches no rows, only the count.
        if (this.count === 'exact') {
          const countSql = `SELECT count(*)::bigint AS c FROM ${ident(this.table)}${whereSql}`
          const counts = await this.executor.query<{ c: number }>(countSql, this.filterParams.slice())
          this.lastCount = Number(counts[0]?.c ?? 0)
        }
        return []
      }
      const rows = await this.executor.query<T>(sql, params)
      if (this.count === 'exact') {
        const countSql = `SELECT count(*)::bigint AS c FROM ${ident(this.table)}${whereSql}`
        const counts = await this.executor.query<{ c: number }>(countSql, this.filterParams.slice())
        this.lastCount = Number(counts[0]?.c ?? 0)
      }
      return rows
    }

    return this.executor.queryInWrite<T>(sql, params)
  }
}

export class NeonDbClient implements DbClient {
  readonly provider = 'neon' as const

  constructor(
    private readonly executor: NeonExecutorApi,
    private readonly userId: string | null,
  ) {}

  from<T = Record<string, unknown>>(table: string): DbQueryBuilder<T> {
    return new NeonQueryBuilder<T>(this.executor, table)
  }

  async rpc<T = any>(functionName: string, args: Record<string, unknown> = {}): Promise<DbResult<T>> {
    const keys = Object.keys(args)
    const values = keys.map((k) => args[k])
    const params = keys.map((_, i) => `$${i + 1}`)
    const text = `SELECT * FROM ${ident(functionName)}(${params.join(', ')})`
    try {
      const rows = await this.executor.query(text, values)
      return { data: rows as T, error: null }
    } catch (err) {
      return { data: null as unknown as T, error: { message: err instanceof Error ? err.message : String(err) } }
    }
  }

  /**
   * Raw SQL for aggregates the PostgREST builder cannot express (COUNT FILTER,
   * BOOL_OR, GROUPING SETS). The executor rewrites `?` to `$n` and puts the RLS
   * identity in scope, so the statement is subject to the same policies.
   */
  raw<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<DbResult<T>> {
    return this.executor.query<T>(sql, params).then(
      (rows) => ({ data: rows as T, error: null }),
      (err: unknown) => ({ data: null as unknown as T, error: { message: err instanceof Error ? err.message : String(err) } }),
    )
  }
}

/** A Neon client bound to one authenticated user. */
export function neonDbClient(userId: string, pool: Pool = getNeonPool()): DbClient {
  return new NeonDbClient(new NeonExecutorImpl(pool, userId), userId)
}

/**
 * A Neon client with no identity in scope. The pooler connects as the branch
 * owner, which bypasses RLS — the service-role equivalent for scheduled jobs.
 */
export function neonServiceDbClient(pool: Pool = getNeonServicePool()): DbClient {
  return new NeonDbClient(new NeonExecutorImpl(pool, null), null)
}
