#!/usr/bin/env node
/**
 * Apply Content Intelligence migrations (0034, 0035) to the hosted Supabase project.
 *
 * These tables are required for the Studio 2.0 Content Intelligence System:
 * - 0034: content_profiles, content_personas.content_profile_id
 * - 0035: content_memories, content_opportunities, content_idea_genomes,
 *         content_evaluations, content_interview_sessions, content_interview_answers,
 *         content_drafts.evaluation_id
 *
 * Env: SUPABASE_ACCESS_TOKEN, NEXT_PUBLIC_SUPABASE_URL
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... NEXT_PUBLIC_SUPABASE_URL=... node scripts/apply-intelligence-migrations.mjs
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
const migrations = [
  '0034_content_profiles.sql',
  '0035_intelligence_system.sql',
]

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
  console.log('Done. Content Intelligence tables are ready.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
