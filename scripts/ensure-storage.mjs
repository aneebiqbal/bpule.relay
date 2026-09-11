#!/usr/bin/env node
/**
 * Ensure the private proof-cvs storage bucket exists and has the right
 * policies. Run after migration 0006 on any environment.
 *
 * Usage: node scripts/ensure-storage.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadEnv() {
  const env = {}
  const file = path.join(root, '.env.local')
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
      if (m) env[m[1]] = m[2]
    }
  }
  return { ...process.env, ...env }
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false } })

async function ensureBucket() {
  const { data: existing } = await admin.storage.getBucket('proof-cvs')
  if (existing) {
    console.log('Bucket proof-cvs already exists')
    return
  }
  const { error } = await admin.storage.createBucket('proof-cvs', {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  })
  if (error) throw error
  console.log('Created bucket proof-cvs (private, 5 MB limit, pdf/jpg/png)')
}

async function ensurePolicies() {
  const sql = `
    do $$ begin
      create policy storage_cv_insert on storage.objects for insert
        to authenticated
        with check (
          bucket_id = 'proof-cvs'
          and (storage.foldername(name))[1] = public.current_rep_id()::text
        );
    exception when duplicate_object then null;
    end $$;

    do $$ begin
      create policy storage_cv_select on storage.objects for select
        to authenticated
        using (
          bucket_id = 'proof-cvs'
          and (
            (storage.foldername(name))[1] = public.current_rep_id()::text
            or public.is_admin()
          )
        );
    exception when duplicate_object then null;
    end $$;

    do $$ begin
      create policy storage_cv_delete on storage.objects for delete
        to authenticated
        using (
          bucket_id = 'proof-cvs'
          and (storage.foldername(name))[1] = public.current_rep_id()::text
        );
    exception when duplicate_object then null;
    end $$;
  `

  // Preferred: Management API (runs as the SQL-editor role, which owns
  // storage.objects). Requires a personal access token.
  const accessToken = env.SUPABASE_ACCESS_TOKEN
  const refMatch = url.match(/^https:\/\/([^.]+)\.supabase\./)
  if (accessToken && refMatch) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${refMatch[1]}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    })
    const body = await res.json().catch(() => null)
    if (res.ok) {
      console.log('Storage policies applied via Management API')
      return
    }
    console.log(`Note: Management API failed (${res.status}). Paste supabase/storage-proof-cvs-policies.sql in the dashboard SQL editor.`)
    if (body) console.log(body)
    return
  }

  // Fallback: exec_sql RPC if the project exposes it.
  let result = null
  try {
    result = await admin.rpc('exec_sql', { query: sql })
  } catch {
    result = null
  }
  if (result?.error) {
    console.log('Note: exec_sql unavailable. Paste supabase/storage-proof-cvs-policies.sql in the dashboard SQL editor.') 
  } else {
    console.log('Storage policies applied')
  }
}

try {
  await ensureBucket()
  await ensurePolicies()
  console.log('Storage setup complete')
} catch (err) {
  console.error('Storage setup failed:', err.message)
  process.exit(1)
}
