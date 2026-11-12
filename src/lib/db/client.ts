/**
 * Provider-aware client for tests and scripts.
 *
 * The DB integration tests historically imported the Neon client directly. To
 * run the same suite against a standard Postgres host (Aiven), they now go
 * through here: the provider resolution picks Neon or Postgres.
 *
 * Both factories accept an optional pool so unit tests can inject a capturing
 * fake; production callers omit it and get the shared pool.
 */
import type { Pool as NeonPool } from '@neondatabase/serverless'
import type { Pool as PgPool } from 'pg'
import type { DbClient } from './types'
import { resolveDbProvider } from './types'
import { neonDbClient, neonServiceDbClient } from './neon'
import { postgresDbClient, postgresServiceDbClient, closePostgresPool } from './postgres'
import { closeNeonPool } from './neon'

export function dbClientFor(userId: string, pool?: NeonPool | PgPool): DbClient {
  if (resolveDbProvider() === 'postgres') {
    return postgresDbClient(userId, pool as PgPool | undefined)
  }
  return neonDbClient(userId, pool as NeonPool | undefined)
}

export function serviceDbClient(pool?: NeonPool | PgPool): DbClient {
  if (resolveDbProvider() === 'postgres') {
    return postgresServiceDbClient(pool as PgPool | undefined)
  }
  return neonServiceDbClient(pool as NeonPool | undefined)
}

export async function closeDbPool(): Promise<void> {
  if (resolveDbProvider() === 'postgres') await closePostgresPool()
  else await closeNeonPool()
}
