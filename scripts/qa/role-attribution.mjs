/**
 * Role-attributed cutover proof.
 *
 * The release gate must answer "which role executed the page queries", not
 * "which backends were opened". A warm pool reuses connections, so backend
 * counts cannot prove the role. The runtime client, however, always sets the
 * RLS identity (`set_config('app.current_user_id', ...)`) before a statement;
 * the service client never does. That makes `set_config` a clean role marker:
 *
 *   relay_app set_config calls > 0  → the application pool is relay_app
 *   neondb_owner set_config calls > 0 → the application pool is still owner
 *
 * The service pool runs no `set_config`, so owner application calls are always
 * a leak. Mixed traffic fails.
 */

const RUNTIME_MARKER = /set_config\s*\(/i

/** Tables the application reads on a normal request. Diagnostic only. */
const APPLICATION_TABLES = [
  /FROM\s+"reps"/i,
  /FROM\s+"profiles"/i,
  /FROM\s+"leads"/i,
  /FROM\s+"conversation_states"/i,
  /FROM\s+"action_events"/i,
  /FROM\s+"assigned_tasks"/i,
  /FROM\s+"daily_accountability"/i,
  /FROM\s+"revenue_identities"/i,
  /FROM\s+"task_events"/i,
  /FROM\s+"internal_notes"/i,
  /FROM\s+"coverage"/i,
]

export function classifyRoleAttribution(rows) {
  let runtimeAppCalls = 0
  let runtimeOwnerCalls = 0
  const applicationSelects = []

  for (const row of rows) {
    const calls = Number(row.calls) || 0
    if (RUNTIME_MARKER.test(row.query)) {
      if (row.role === 'relay_app') runtimeAppCalls += calls
      else if (row.role === 'neondb_owner') runtimeOwnerCalls += calls
    }
    if (APPLICATION_TABLES.some((re) => re.test(row.query))) {
      applicationSelects.push({ role: row.role, query: row.query, calls })
    }
  }

  return { runtimeAppCalls, runtimeOwnerCalls, applicationSelects }
}

/**
 * The release assertion. No runtime queries at all is inconclusive (fail).
 * Any owner runtime query fails, even when relay_app also ran — mixed traffic
 * is not a pass.
 */
export function assertCutover(attribution) {
  if (attribution.runtimeAppCalls === 0 && attribution.runtimeOwnerCalls === 0) {
    return { pass: false, reason: 'no runtime application queries observed — inconclusive' }
  }
  if (attribution.runtimeOwnerCalls > 0) {
    return {
      pass: false,
      reason: `neondb_owner executed ${attribution.runtimeOwnerCalls} runtime application queries (relay_app: ${attribution.runtimeAppCalls})`,
    }
  }
  if (attribution.runtimeAppCalls === 0) {
    return { pass: false, reason: 'relay_app executed no runtime application queries' }
  }
  return { pass: true, reason: `relay_app executed ${attribution.runtimeAppCalls} runtime application queries` }
}
