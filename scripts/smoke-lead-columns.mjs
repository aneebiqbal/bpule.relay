/**
 * Hosted schema smoke test for the two columns the app now writes on POST
 * /api/leads (play_id from 0005, tags from 0006). Inserts as aneeb (RLS path)
 * with both columns populated, then removes the row.
 *
 * Run: node scripts/smoke-lead-columns.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadEnv() {
  const file = path.join(root, '.env.local')
  const env = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
    if (m) env[m[1]] = m[2]
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) process.exit(1)
  return { url, anon }
}

const { url, anon } = loadEnv()
const sb = createClient(url, anon)
const { error: signErr } = await sb.auth.signInWithPassword({
  email: 'aneeb@scout.dev',
  password: 'scout-dev-password',
})
if (signErr) {
  console.error('FAIL: sign in', signErr.message)
  process.exit(1)
}

const company = `Column Smoke ${Date.now()}`
const playId = 'eeeeeeee-0000-0000-0000-000000000001'

const { data, error } = await sb
  .from('leads')
  .insert({
    owner_rep_id: 'bbbbbbbb-0000-0000-0000-000000000002',
    company,
    play_id: playId,
    tags: ['smoke', 'schema'],
    signal_evidence: 'smoke test of play_id and tags columns',
    status: 'new',
  })
  .select('id, play_id, tags')
  .single()

if (error) {
  console.error('FAIL: insert with play_id + tags:', error.message)
  process.exit(1)
}

const ok =
  data.play_id === playId && Array.isArray(data.tags) && data.tags.includes('smoke')

const del = await sb.from('leads').delete().eq('id', data.id)
if (del.error) console.error('warn: cleanup', del.error.message)

console.log(ok ? 'PASS  leads accepts play_id + tags and round-trips them' : 'FAIL  round-trip mismatch')
process.exit(ok ? 0 : 1)