/**
 * Probe the proof-cvs bucket the way the app does: as a signed-in rep, via the
 * anon key and RLS. Uploads a 1x1 PNG to proof-cvs/{rep_id}/, then deletes it.
 * If the bucket does not exist, the upload errors and we know to create it.
 *
 * Run: node scripts/smoke-cv-bucket.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadEnv() {
  const env = {}
  for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const env = loadEnv()
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { error: signErr } = await sb.auth.signInWithPassword({
  email: 'aneeb@scout.dev',
  password: 'scout-dev-password',
})
if (signErr) {
  console.error('FAIL: sign in', signErr.message)
  process.exit(1)
}

const repId = 'bbbbbbbb-0000-0000-0000-000000000002'
const name = `${repId}/smoke-${Date.now()}.png`
// Minimal 1x1 transparent PNG.
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const { error: upErr } = await sb.storage.from('proof-cvs').upload(name, bytes, {
  contentType: 'image/png',
  upsert: false,
})
if (upErr) {
  console.error('FAIL: upload to proof-cvs:', upErr.message)
  if (/not found|Bucket|resource/i.test(upErr.message)) {
    console.error('The proof-cvs bucket does not exist on hosted. Create it:')
    console.error('  node scripts/ensure-storage.mjs  (with SUPABASE_SERVICE_ROLE_KEY set)')
    console.error('  or via the dashboard: Storage > New bucket > proof-cvs, private, 5 MB, pdf/jpg/png')
  }
  process.exit(1)
}

console.log('PASS  upload succeeded (bucket exists, RLS insert policy works)')

const { error: delErr } = await sb.storage.from('proof-cvs').remove([name])
if (delErr) {
  console.error('warn: cleanup failed', delErr.message)
} else {
  console.log('PASS  cleanup removed probe file')
}
process.exit(0)