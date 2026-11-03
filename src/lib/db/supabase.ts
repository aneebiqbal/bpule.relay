/**
 * Supabase implementation of the canonical database contract.
 *
 * This is the rollback path: it wraps the existing Supabase client so that
 * behaviour is bit-for-bit what it is today. Nothing here changes a query; it
 * only translates the canonical interface onto PostgREST.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
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

// The Supabase query builder mutates through `.select()` and then exposes the
// filter/insert/update methods, so the concrete type is a union across two
// builder classes. We delegate at runtime and type the handle as `any` here —
// this is a pure adapter, so there is no behaviour to lose in the cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseBuilder = any

function adapt<T>(inner: SupabaseBuilder): DbQueryBuilder<T> {
  const builder = {
    select(columns?: string, opts?: SelectOptions) {
      inner.select(columns ?? '*', {
        count: (opts?.count as 'exact' | undefined) ?? undefined,
        head: opts?.head,
      })
      return builder as unknown as DbQueryBuilder<T>
    },
    eq(column: string, value: unknown) {
      inner.eq(column, value)
      return builder as unknown as DbQueryBuilder<T>
    },
    neq(column: string, value: unknown) {
      inner.neq(column, value)
      return builder as unknown as DbQueryBuilder<T>
    },
    gt(column: string, value: unknown) {
      inner.gt(column, value)
      return builder as unknown as DbQueryBuilder<T>
    },
    gte(column: string, value: unknown) {
      inner.gte(column, value)
      return builder as unknown as DbQueryBuilder<T>
    },
    lt(column: string, value: unknown) {
      inner.lt(column, value)
      return builder as unknown as DbQueryBuilder<T>
    },
    lte(column: string, value: unknown) {
      inner.lte(column, value)
      return builder as unknown as DbQueryBuilder<T>
    },
    is(column: string, value: unknown) {
      inner.is(column, value)
      return builder as unknown as DbQueryBuilder<T>
    },
    in(column: string, values: readonly unknown[]) {
      inner.in(column, [...values])
      return builder as unknown as DbQueryBuilder<T>
    },
    contains(column: string, value: unknown) {
      inner.contains(column, value)
      return builder as unknown as DbQueryBuilder<T>
    },
    or(filter: string) {
      inner.or(filter)
      return builder as unknown as DbQueryBuilder<T>
    },
    not(column: string, op: string, value: unknown) {
      inner.not(column, op as never, value as never)
      return builder as unknown as DbQueryBuilder<T>
    },
    filter(column: string, op: string, value: unknown) {
      inner.filter(column, op as never, value as never)
      return builder as unknown as DbQueryBuilder<T>
    },
    ilike(column: string, pattern: string) {
      inner.ilike(column, pattern)
      return builder as unknown as DbQueryBuilder<T>
    },
    like(column: string, pattern: string) {
      inner.like(column, pattern)
      return builder as unknown as DbQueryBuilder<T>
    },
    match(filter: Record<string, unknown>) {
      inner.match(filter as never)
      return builder as unknown as DbQueryBuilder<T>
    },
    order(column: string, opts?: OrderOptions) {
      inner.order(column, { ascending: opts?.ascending ?? true, nullsFirst: opts?.nullsFirst })
      return builder as unknown as DbQueryBuilder<T>
    },
    limit(count: number) {
      inner.limit(count)
      return builder as unknown as DbQueryBuilder<T>
    },
    range(from: number, to: number) {
      inner.range(from, to)
      return builder as unknown as DbQueryBuilder<T>
    },
    async single(): Promise<DbSingleResult<T>> {
      const res = await inner.single()
      return { data: (res.data as T | null) ?? null, error: res.error }
    },
    async maybeSingle(): Promise<DbSingleResult<T>> {
      const res = await inner.maybeSingle()
      return { data: (res.data as T | null) ?? null, error: res.error }
    },
    insert(values: unknown) {
      inner.insert(values)
      return builder as unknown as DbQueryBuilder<T>
    },
    update(values: unknown) {
      inner.update(values)
      return builder as unknown as DbQueryBuilder<T>
    },
    upsert(values: unknown, opts?: UpsertOptions) {
      inner.upsert(values, {
        onConflict: opts?.onConflict,
        ignoreDuplicates: opts?.ignoreDuplicates ?? false,
      })
      return builder as unknown as DbQueryBuilder<T>
    },
    delete(_opts?: { count?: CountStrategy; returning?: boolean }) {
      inner.delete()
      return builder as unknown as DbQueryBuilder<T>
    },  }

  return {
    ...builder,
    then<TResult1 = DbResult<T[]>, TResult2 = never>(
      onfulfilled?: ((value: DbResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return inner.then(
        (res: any) =>
          onfulfilled
            ? onfulfilled({ data: (res.data as T[]) ?? null, error: res.error, count: res.count ?? null })
            : ({ data: (res.data as T[]) ?? null, error: res.error, count: res.count ?? null } as never),
        (reason: unknown) => (onrejected ? onrejected(reason) : Promise.reject(reason)),
      )
    },
  } as unknown as DbQueryBuilder<T>
}

export class SupabaseDbClient implements DbClient {
  readonly provider = 'supabase' as const

  constructor(private readonly client: SupabaseClient) {}

  from<T = Record<string, unknown>>(table: string): DbQueryBuilder<T> {
    return adapt<T>(this.client.from(table))
  }

  rpc<T = any>(functionName: string, args?: Record<string, unknown>): PromiseLike<DbResult<T>> {
    return this.client.rpc(functionName, args).then(
      (res) => ({ data: (res.data ?? null) as T, error: res.error }),
      (err: unknown) => ({ data: null as unknown as T, error: { message: err instanceof Error ? err.message : String(err) } }),
    )
  }
}

/** Adapts a Supabase client into the canonical contract. */
export function supabaseDbClient(client: SupabaseClient): DbClient {
  return new SupabaseDbClient(client)
}

export type { CountStrategy }
