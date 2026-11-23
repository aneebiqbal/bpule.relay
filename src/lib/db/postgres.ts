/**
 * Standard PostgreSQL implementation of the canonical database contract.
 *
 * Works with any standard Postgres host (Aiven, RDS, Cloud SQL, local). Uses
 * `pg`. The RLS identity travels in the SAME `app.current_user_id` GUC the Neon
 * adapter uses, set inside a transaction with `set_config(..., true)`, so the
 * existing RLS policies and `auth.uid()` compatibility functions behave
 * identically. No Neon- or Supabase-specific API is used.
 */
import { Pool, types as pgTypes, type PoolClient } from 'pg'
import { PostgresQueryBuilder, type NeonExecutorApi } from './neon'
import type { DbClient, DbQueryBuilder, DbResult } from './types'
import { resolvePgSslConfig } from './ssl'
import { perfLog, perfSlow } from '@/lib/perf-trace'

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Refusing to quote suspicious identifier: ${name}`)
  return `"${name}"`
}

/**
 * Preserve the Neon/PostgREST text behavior for date/timestamp columns so the
 * application's parsing never changes with the transport.
 */
function pgTypeParser(id: number, format?: string): (value: string | null) => unknown {
  if (id === 1082 || id === 1114 || id === 1184) {
    return (value) => (value === null ? null : String(value))
  }
  return pgTypes.getTypeParser(id, format as 'text' | 'binary' | undefined)
}

let pool: Pool | null = null
let servicePool: Pool | null = null

/** Runtime pool. Keep this small: every PM2/Vercel instance holds its own. */
export function getPostgresPool(): Pool {
  if (pool) return pool
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not configured for the postgres provider')
  pool = new Pool({
    connectionString: url,
    // Aiven Developer-1 allows 100 connections; a single VPS with a handful of
    // instances stays far below it at 12 per instance.
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    types: { getTypeParser: (id, format) => pgTypeParser(id, format) },
    ssl: resolvePgSslConfig(),
    // Fail fast when the service is at capacity instead of queueing forever.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  })
  pool.on('error', (err) => {
    // A failing idle client must never become an uncaughtException.
    console.error('[db] postgres client error (degraded):', String(err instanceof Error ? err.message : err))
  })
  return pool
}

/** Service pool — the privileged, no-identity connection for cron/signed paths. */
export function getPostgresServicePool(): Pool {
  if (servicePool) return servicePool
  const url = process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not configured for the postgres provider')
  servicePool = new Pool({
    connectionString: url,
    max: Number(process.env.SERVICE_DATABASE_POOL_MAX ?? 1),
    types: { getTypeParser: (id, format) => pgTypeParser(id, format) },
    ssl: resolvePgSslConfig(),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  })
  servicePool.on('error', (err) => {
    console.error('[db] postgres service client error (degraded):', String(err instanceof Error ? err.message : err))
  })
  return servicePool
}

/** Closes the pools. Used by tests and graceful shutdown. */
export async function closePostgresPool(): Promise<void> {
  if (pool) await pool.end()
  if (servicePool) await servicePool.end()
  pool = null
  servicePool = null
}

function rewrite(text: string, values: unknown[]): { sql: string; params: unknown[] } {
  let n = 0
  return { sql: text.replace(/\?/g, () => `$${++n}`), params: values }
}

/**
 * Low-level executor: runs SQL with the caller's identity in scope.
 *
 * Reads set the identity inside the same transaction with
 * `set_config(..., true)` (transaction-local). This is the exact behavior the
 * Neon executor uses and the only ordering Postgres guarantees for RLS plans.
 */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * A pool checkout can queue indefinitely when every connection is busy. Fail
 * fast instead: a hung checkout is a production incident, not a slow query.
 */
const POOL_WAIT_MS = Number(process.env.DATABASE_POOL_QUEUE_MS ?? 15_000)

async function checkout(pgPool: Pool): Promise<PoolClient> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      pgPool.connect(),
      new Promise<PoolClient>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('database pool exhausted')), POOL_WAIT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export class PostgresExecutorImpl implements NeonExecutorApi {
  readonly provider = 'postgres' as const

  constructor(
    private readonly pgPool: Pool,
    private readonly userId: string | null,
  ) {}

  /**
   * One round trip for `BEGIN` plus the transaction-local RLS identity.
   *
   * The identity is `SET LOCAL`, so it is scoped to this transaction and reset
   * by `COMMIT`/`ROLLBACK` — no session state leaks between checkouts. The user
   * id is a validated UUID, so inlining it is safe; anything else falls back to
   * a parameterised `set_config` (one extra round trip).
   *
   * A client is checked out per operation and released in `finally`, so two
   * concurrent operations never share a transaction client.
   */
  private async begin(client: PoolClient): Promise<void> {
    const userId = this.userId
    if (userId && UUID_RE.test(userId)) {
      await client.query(`BEGIN; SELECT set_config('app.current_user_id', '${userId}', true)`)
      return
    }
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', userId ?? ''])
  }

  async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    const { sql, params } = rewrite(text, values)
    const client = await checkout(this.pgPool)
    const started = performance.now()
    try {
      await this.begin(client)
      const res = await client.query(sql, params)
      await client.query('COMMIT')
      const ms = performance.now() - started
      perfLog('db.read', ms)
      perfSlow('db.read', ms)
      return res.rows as T[]
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw new Error(`Postgres query failed: ${err instanceof Error ? err.message : String(err)}\n${sql}`)
    } finally {
      client.release()
    }
  }

  async queryInWrite<T>(text: string, values: unknown[] = []): Promise<T[]> {
    const { sql, params } = rewrite(text, values)
    const client = await checkout(this.pgPool)
    const started = performance.now()
    try {
      await this.begin(client)
      const res = await client.query(sql, params)
      await client.query('COMMIT')
      const ms = performance.now() - started
      perfLog('db.write', ms)
      perfSlow('db.write', ms)
      return res.rows as T[]
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw new Error(`Postgres write failed: ${err instanceof Error ? err.message : String(err)}\n${sql}`)
    } finally {
      client.release()
    }
  }

  async transaction<T>(fn: (executor: NeonExecutorApi) => Promise<T>): Promise<T> {
    const client = await checkout(this.pgPool)
    const started = performance.now()
    try {
      await this.begin(client)
      const bound = new BoundPostgresExecutor(client, this.userId)
      const result = await fn(bound)
      await client.query('COMMIT')
      perfLog('db.transaction', performance.now() - started)
      return result
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }
}

/** Executor bound to one checked-out connection inside a transaction. */
class BoundPostgresExecutor implements NeonExecutorApi {
  constructor(
    private readonly client: PoolClient,
    private readonly userId: string | null,
  ) {}

  async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    return this.run<T>(text, values)
  }

  async queryInWrite<T>(text: string, values: unknown[] = []): Promise<T[]> {
    return this.run<T>(text, values)
  }

  private async run<T>(text: string, values: unknown[]): Promise<T[]> {
    const { sql, params } = rewrite(text, values)
    try {
      const res = await this.client.query(sql, params)
      return res.rows as T[]
    } catch (err) {
      throw new Error(`Postgres query failed: ${err instanceof Error ? err.message : String(err)}\n${sql}`)
    }
  }
}

export class PostgresDbClient implements DbClient {
  readonly provider = 'postgres' as const

  constructor(
    private readonly executor: NeonExecutorApi,
    private readonly userId: string | null,
  ) {}

  from<T = Record<string, unknown>>(table: string): DbQueryBuilder<T> {
    return new PostgresQueryBuilder<T>(this.executor, table)
  }

  async rpc<T = any>(functionName: string, args: Record<string, unknown> = {}): Promise<DbResult<T>> {
    const keys = Object.keys(args)
    const values = keys.map((k) => args[k])
    // Named notation, never positional: the server binds $n in call-site order,
    // so an omitted optional parameter shifted every later argument into the
    // wrong slot (record_prospect_extracted sent its business date into
    // p_source_event_id and collapsed a day of captures into one).
    const params = keys.map((k, i) => `${ident(k)} => $${i + 1}`)
    const text = `SELECT * FROM ${ident(functionName)}(${params.join(', ')})`
    try {
      const rows = await this.executor.query(text, values)
      return { data: rows as T, error: null }
    } catch (err) {
      return { data: null as unknown as T, error: { message: err instanceof Error ? err.message : String(err) } }
    }
  }

  raw<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<DbResult<T>> {
    return this.executor.query<T>(sql, params).then(
      (rows) => ({ data: rows as T, error: null }),
      (err: unknown) => ({ data: null as unknown as T, error: { message: err instanceof Error ? err.message : String(err) } }),
    )
  }

  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    if (!this.executor.transaction) {
      throw new Error('Transactions are not supported by this Postgres executor')
    }
    return this.executor.transaction((bound) => fn(new PostgresDbClient(bound, this.userId)))
  }
}

/** A standard-Postgres client bound to one authenticated user. */
export function postgresDbClient(userId: string, pgPool: Pool = getPostgresPool()): DbClient {
  return new PostgresDbClient(new PostgresExecutorImpl(pgPool, userId), userId)
}

/** A standard-Postgres client with no identity in scope (service boundary). */
export function postgresServiceDbClient(pgPool: Pool = getPostgresServicePool()): DbClient {
  return new PostgresDbClient(new PostgresExecutorImpl(pgPool, null), null)
}
