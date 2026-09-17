#!/usr/bin/env node
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
require('dotenv').config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// Use PostgREST OpenAPI spec to check columns visible to PostgREST
const { data: spec, error: specError } = await sb.from('relay_runs').select('*').limit(0)
console.log('PostgREST OpenAPI spec:', specError ? specError.message : 'OK')

// Try querying with explicit columns
const { data: selectData, error: selectError } = await sb
  .from('relay_runs')
  .select('id, status, current_step, revenue_identity_id, correlation_id, run_type, primary_entity_type, primary_entity_id, assigned_rep_id, metadata, context')
  .limit(1)

console.log('Select with all columns:', selectError ? selectError.message : 'OK')
if (selectData && selectData.length > 0) {
  console.log('Found row:', selectData[0])
}

// Check RPC functions via OpenAPI
const rpcs = ['create_relay_run', 'transition_relay_run', 'emit_relay_event', 'get_run_events']
for (const rpc of rpcs) {
  const { error: rpcError } = await sb.rpc(rpc, {
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_run_type: 'outbound',
  })
  console.log(rpc, ':', rpcError ? rpcError.message.slice(0, 100) : 'exists (param error = OK)')
}
