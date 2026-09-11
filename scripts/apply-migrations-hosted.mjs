#!/usr/bin/env node
/**
 * Apply pending migrations (0008, 0009) to the hosted Supabase project
 * via the Management API SQL endpoint.
 *
 * Env: SUPABASE_ACCESS_TOKEN, NEXT_PUBLIC_SUPABASE_URL
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const token = process.env.SUPABASE_ACCESS_TOKEN
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')

if (!token || !url) {
  console.error('Set SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL.')
  process.exit(1)
}

const projectRef = url.replace('https://', '').split('.')[0]
const api = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')
const migrations = ['0008_phase_7_eval_fewshot_semantic.sql', '0009_phase_8_upwork_csv_push_ops.sql']

async function runSql(name, sql) {
  const res = await fetch(api, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  if (!res.ok) {
    console.error(`FAILED ${name} (${res.status}):`)
    console.error(body.slice(0, 2000))
    process.exitCode = 1
    return false
  }
  console.log(`Applied ${name}`)
  return true
}

async function main() {
  for (const name of migrations) {
    const sql = readFileSync(join(dir, name), 'utf8')
    await runSql(name, sql)
  }
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
