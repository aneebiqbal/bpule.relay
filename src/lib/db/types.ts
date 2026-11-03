/**
 * Canonical database contract.
 *
 * The application talks to this interface, never to a concrete driver. Two
 * implementations exist behind it:
 *
 *   - `SupabaseDbClient` — the existing PostgREST-backed client (rollback path)
 *   - `NeonDbClient`     — a SQL adapter over Neon Postgres
 *
 * The shape deliberately mirrors the PostgREST query-builder subset the app
 * already uses, so `src/lib/store/supabase-store.ts` (and the domain modules
 * around it) runs against either provider without a per-call-site rewrite.
 * New code should use domain repositories in `src/lib/db/repos/` instead of
 * reaching for `.from()` directly.
 */

export interface DbError {
  message: string
  details?: string
  hint?: string
  code?: string
}

/**
 * A successful query result. `data` is non-null here; a failed query carries
 * `error` and the caller checks it, so `data` does not need a null union.
 */
export interface DbResult<T = any> {
  data: T
  error: DbError | null
  /** Present when the query asked for `count: 'exact'`. */
  count?: number | null
}

/** A `.single()` / `.maybeSingle()` result, where zero rows is not an error. */
export interface DbSingleResult<T = any> {
  data: T | null
  error: DbError | null
}

export type CountStrategy = 'exact' | 'planned' | 'estimated'

export interface SelectOptions {
  count?: CountStrategy
  /** PostgREST `head: true` — return no rows, only the count. */
  head?: boolean
}

export interface OrderOptions {
  ascending?: boolean
  nullsFirst?: boolean
}

export interface UpsertOptions {
  onConflict?: string
  ignoreDuplicates?: boolean
}

/**
 * The query-builder subset the app uses. Every method returns the builder so
 * calls chain; the builder is thenable so `await query` executes it.
 */
export interface DbQueryBuilder<T = any> extends PromiseLike<DbResult<T[]>> {
  /** Columns to select; `*` when omitted. */
  select(columns?: string, opts?: SelectOptions): DbQueryBuilder<T>
  eq(column: string, value: unknown): DbQueryBuilder<T>
  neq(column: string, value: unknown): DbQueryBuilder<T>
  gt(column: string, value: unknown): DbQueryBuilder<T>
  gte(column: string, value: unknown): DbQueryBuilder<T>
  lt(column: string, value: unknown): DbQueryBuilder<T>
  lte(column: string, value: unknown): DbQueryBuilder<T>
  /** `IS NULL` when value is null, `IS TRUE/FALSE` for booleans, else `=`. */
  is(column: string, value: unknown): DbQueryBuilder<T>
  in(column: string, values: readonly unknown[]): DbQueryBuilder<T>
  /** Array/jsonb containment (`@>`). */
  contains(column: string, value: unknown): DbQueryBuilder<T>
  /** PostgREST `or` filter string, e.g. `"a.eq.1,b.gt.2"`. */
  or(filter: string): DbQueryBuilder<T>
  /** PostgREST `not` filter, e.g. `.not('company', 'eq', 'x')`. */
  not(column: string, op: string, value: unknown): DbQueryBuilder<T>
  /** PostgREST `filter`, the generic form of the operator helpers. */
  filter(column: string, op: string, value: unknown): DbQueryBuilder<T>
  /** Case-insensitive `LIKE`. */
  ilike(column: string, pattern: string): DbQueryBuilder<T>
  /** Case-sensitive `LIKE`. */
  like(column: string, pattern: string): DbQueryBuilder<T>
  /** PostgREST `match` — every column/value pair must be equal. */
  match(filter: Record<string, unknown>): DbQueryBuilder<T>
  order(column: string, opts?: OrderOptions): DbQueryBuilder<T>
  limit(count: number): DbQueryBuilder<T>
  range(from: number, to: number): DbQueryBuilder<T>
  /** Expects exactly one row; errors when there are zero or many. */
  single(): PromiseLike<DbSingleResult<T>>
  /** Expects at most one row. */
  maybeSingle(): PromiseLike<DbSingleResult<T>>
  /** Follow with `.select()` to get the inserted rows back. */
  insert(values: unknown): DbQueryBuilder<T>
  update(values: unknown): DbQueryBuilder<T>
  upsert(values: unknown, opts?: UpsertOptions): DbQueryBuilder<T>
  /** PostgREST also accepts an options object here; the Neon adapter ignores it. */
  delete(opts?: { count?: CountStrategy; returning?: boolean }): DbQueryBuilder<T>
}

export interface DbClient {
  from<T = any>(table: string): DbQueryBuilder<T>
  rpc<T = any>(functionName: string, args?: Record<string, unknown>): PromiseLike<DbResult<T>>
  /** The provider that produced this client, for diagnostics only. */
  readonly provider: 'supabase' | 'neon'
}

/** Which provider the process is running. */
export type DbProvider = 'supabase' | 'neon'

/**
 * The provider the server rendered into the page.
 *
 * Next.js only inlines `NEXT_PUBLIC_*` names into the client bundle, and that
 * inlining is not dependable in every runtime. The root layout therefore writes
 * the resolved provider onto `globalThis`, which is authoritative for the
 * browser and cannot drift from what the server is actually using.
 */
function readBrowserFlag(name: string): string | undefined {
  if (typeof globalThis === 'undefined') return undefined
  const value = (globalThis as Record<string, unknown>)[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function resolveDbProvider(env: NodeJS.ProcessEnv = process.env): DbProvider {
  const raw = (
    env.RELAY_DB_PROVIDER ??
    env.NEXT_PUBLIC_RELAY_DB_PROVIDER ??
    readBrowserFlag('__RELAY_DB_PROVIDER__') ??
    'supabase'
  )
    .trim()
    .toLowerCase()
  return raw === 'neon' ? 'neon' : 'supabase'
}
