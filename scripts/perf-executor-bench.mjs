#!/usr/bin/env node
/**
 * Executor round-trip benchmark.
 *
 * The production database is in Singapore and the VPS is in Dallas, so one
 * round trip costs ~210ms. This script measures the two executor shapes against
 * a local Postgres (near-zero RTT) and extrapolates the production wall time.
 *
 *   old: BEGIN + set_config + SELECT + COMMIT   (4 round trips per read)
 *   new: set_config once, then N SELECTs        (1 round trip per read)
 *
 * Usage: node scripts/perf-executor-bench.mjs [n]
 */
import pg from 'pg'

const N = Number(process.argv[2] ?? 20)
const connectionString =
  process.env.BENCH_DATABASE_URL ??
  'postgresql://mac@localhost:5432/postgres?host=/tmp'

const pool = new pg.Pool({ connectionString, max: 2 })

async function main() {
  await pool.query('create temp table if not exists perf_bench (id int)')
  await pool.query('insert into perf_bench select generate_series(1, 100)')

  // Old shape: a transaction per read.
  let started = performance.now()
  for (let i = 0; i < N; i += 1) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', 'u1'])
      await client.query('SELECT count(*) FROM perf_bench')
      await client.query('COMMIT')
    } finally {
      client.release()
    }
  }
  const oldPer = (performance.now() - started) / N

  // New shape: one connection, identity set once, then N reads.
  started = performance.now()
  const client = await pool.connect()
  await client.query('SELECT set_config($1, $2, false)', ['app.current_user_id', 'u1'])
  for (let i = 0; i < N; i += 1) {
    await client.query('SELECT count(*) FROM perf_bench')
  }
  client.release()
  const newPer = (performance.now() - started) / N

  const RTT_MS = 210
  const roundTrips = (perMs, rtt) => Math.round(perMs / rtt)

  console.log(`queries: ${N}`)
  console.log(`old: ${oldPer.toFixed(2)}ms/query local  (~${roundTrips(oldPer, RTT_MS)} round trips)`)
  console.log(`new: ${newPer.toFixed(2)}ms/query local  (~${roundTrips(newPer, RTT_MS)} round trips)`)
  console.log('')
  console.log(`extrapolated at ${RTT_MS}ms RTT (Dallas -> Singapore):`)
  console.log(`  old 15-query request: ~${(((4 * RTT_MS) * 15) / 1000).toFixed(1)}s`)
  console.log(`  new 15-query request: ~${(((1 * RTT_MS) * 15) / 1000).toFixed(1)}s`)
  console.log(`  speedup: ${(oldPer / newPer).toFixed(1)}x on the local measurement`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
