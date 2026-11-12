/**
 * Provider-aware client for tests and scripts.
 *
 * The DB integration tests historically imported the Neon client directly. To
 * run the same suite against a standard Postgres host (Aiven), they now go
 * through here: the provider resolution picks Neon or Postgres.
 */
import type { DbClient } from './types'
import { resolveDbProvider } from './types'
import { neonDbClient, neonServiceDbClient } from './neon'
import { postgresDbClient, postgresServiceDbClient, closePostgresPool } from './postgres'
import { closeNeonPool } from './neon'

export function dbClientFor(userId: string): DbClient {
  return resolveDbProvider() === 'postgres' ? postgresDbClient(userId) : neonDbClient(userId)
}

export function serviceDbClient(): DbClient {
  return resolveDbProvider() === 'postgres' ? postgresServiceDbClient() : neonServiceDbClient()
}

export async function closeDbPool(): Promise<void> {
  if (resolveDbProvider() === 'postgres') await closePostgresPool()
  else await closeNeonPool()
}
