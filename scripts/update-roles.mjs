#!/usr/bin/env node
/**
 * Update rep roles on hosted Supabase.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *      SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !serviceRole || !anonKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const UPDATES = [
  { email: 'aneeb@scout.dev', role: 'admin' },
  { email: 'hassan@scout.dev', role: 'rep' },
]

async function main() {
  for (const u of UPDATES) {
    const { data: rep } = await supabase
      .from('reps')
      .select('id, name, role')
      .eq('name', u.email.split('@')[0])
      .maybeSingle()

    if (!rep) {
      console.log(`Rep not found for ${u.email}`)
      continue
    }

    const { error } = await supabase
      .from('reps')
      .update({ role: u.role })
      .eq('id', rep.id)

    if (error) {
      console.error(`Failed to update ${u.email}:`, error.message)
    } else {
      console.log(`Updated ${u.email} -> ${u.role}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
