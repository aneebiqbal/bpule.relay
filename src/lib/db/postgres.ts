/**
 * Standard PostgreSQL implementation of the canonical database contract.
 *
 * Works with any standard Postgres host (Aiven, RDS, Cloud SQL, local). Uses
 * `pg`. The RLS identity travels in the SAME `app.current_user_id` GUC the Neon
 * adapter uses, set inside a transaction with `set_config(..., true)`, so the
 * existing RLS policies and `auth.uid()` compatibility functions behave
 * identically. No Neon- or Supabase-specific API is used.
 */
import { Pool, types as pgTypes } from 'pg'
import { PostgresQueryBuilder, type NeonExecutorApi } from './neon'
import type { DbClient, DbQueryBuilder, DbResult } from './types'

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

/**
 * Aiven (and most managed Postgres proxies) present a private CA. Verification
 * is off by default for the certification; set DATABASE_SSL_VERIFY=true with
 * the CA in the system trust store for production.
 */
function sslConfig(): { rejectUnauthorized: boolean } | undefined {
  if (process.env.DATABASE_SSL === 'false') return undefined
  return { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY === 'true' }
}

/** Runtime pool. Keep this small: Vercel runs many concurrent processes. */
export function getPostgresPool(): Pool {
  if (pool) return pool
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not configured for the postgres provider')
  pool = new Pool({
    connectionString: url,
    // Keep this small: Vercel runs many concurrent instances, and every one
    // holds its own pool. On a 100-connection Aiven plan, a pool of 12 across a
    // dozen warm instances exhausts the service during a traffic burst.
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    types: { getTypeParser: (id, format) => pgTypeParser(id, format) },
    ssl: sslConfig(),
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
    ssl: sslConfig(),
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
export class PostgresExecutorImpl implements NeonExecutorApi {
  readonly provider = 'postgres' as const

  constructor(
    private readonly pgPool: Pool,
    private readonly userId: string | null,
  ) {}

  async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    const { sql, params } = rewrite(text, values)
    const client = await this.pgPool.connect()
    try {
      await client.query('BEGIN')
      if (this.userId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', this.userId])
      }
      const res = await client.query(sql, params)
      await client.query('COMMIT')
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
    const client = await this.pgPool.connect()
    try {
      await client.query('BEGIN')
      if (this.userId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', this.userId])
      }
      const res = await client.query(sql, params)
      await client.query('COMMIT')
      return res.rows as T[]
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw new Error(`Postgres write failed: ${err instanceof Error ? err.message : String(err)}\n${sql}`)
    } finally {
      client.release()
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
    const params = keys.map((_, i) => `$${i + 1}`)
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
}

/** A standard-Postgres client bound to one authenticated user. */
export function postgresDbClient(userId: string, pgPool: Pool = getPostgresPool()): DbClient {
  return new PostgresDbClient(new PostgresExecutorImpl(pgPool, userId), userId)
}

/** A standard-Postgres client with no identity in scope (service boundary). */
export function postgresServiceDbClient(pgPool: Pool = getPostgresServicePool()): DbClient {
  return new PostgresDbClient(new PostgresExecutorImpl(pgPool, null), null)
}
