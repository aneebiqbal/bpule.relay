/**
 * Service-client allowlist — the only places a signed-in request may reach the
 * owner/service pool.
 *
 * Everything not listed here fails `NORMAL_REQUEST_SERVICE_CALLS_ZERO`. Each
 * entry carries its justification: cron/webhook (no rep session), auth
 * bootstrap, dataset/system secondary writes, or a documented fail-closed
 * table. "Admin route" is not a justification.
 */
export const SERVICE_CLIENT_ALLOWLIST: ReadonlyArray<{ prefix: string; reason: string }> = [
  // Scheduled jobs — no rep session, cron-secret gated.
  { prefix: 'src/app/api/cron/', reason: 'Vercel Cron; requireCronSecret, no signed-in rep' },
  { prefix: 'src/app/api/eval/cron-run/', reason: 'Scheduled evaluation run' },
  { prefix: 'src/app/api/few-shot/refresh/', reason: 'Scheduled few-shot refresh' },
  { prefix: 'src/app/api/trends/ingest/', reason: 'Scheduled trend ingest' },
  { prefix: 'src/app/api/relay/reconcile/', reason: 'Scheduled reconciliation' },

  // Signed provider callbacks — secret or single-use signed state.
  { prefix: 'src/app/api/email/webhook/', reason: 'Provider webhook; EMAIL_WEBHOOK_SECRET' },
  { prefix: 'src/app/api/email/mailbox/callback/', reason: 'OAuth callback; signed single-use state' },

  // Auth bootstrap — provisioning happens before a session exists.
  { prefix: 'src/app/api/auth/callback/', reason: 'Auth bootstrap; member provisioning' },
  { prefix: 'src/app/api/signup/', reason: 'Invite-gated signup; no session yet' },

  // Org deletion — cascading writes RLS cannot express; MANAGE_ORG_SETTINGS gated.
  { prefix: 'src/app/api/organization/delete/', reason: 'Cascading org delete; documented RLS limitation' },

  // Dataset / training system secondary writes — always after the RLS write.
  { prefix: 'src/app/api/dataset/', reason: 'Dataset/training capture; system secondary write' },
  { prefix: 'src/app/api/leads/[id]/conversation/', reason: 'Dataset capture after the RLS send' },
  { prefix: 'src/app/api/leads/[id]/contact/', reason: 'Dataset capture after the RLS write' },
  { prefix: 'src/app/api/prospect/', reason: 'Shadow/dataset capture after the RLS write' },
  { prefix: 'src/app/api/upwork/extract/', reason: 'Dataset capture after the RLS create' },

  // Profile enrichment / batch derived-data writes.
  { prefix: 'src/app/api/profile-intelligence/', reason: 'Enrichment/batch derived-data writes; system maintenance' },
  { prefix: 'src/app/api/admin/training-data/', reason: 'Training-data authoring; system maintenance' },

  // Documented fail-closed tables.
  { prefix: 'src/app/api/admin/performance/config/', reason: 'performance_config has no RLS policy (fail-closed); migration needed' },

  // Read-only admin telemetry. These read across many tables and are the next
  // migration to relay_app + admin authorization; tracked as documented debt.
  { prefix: 'src/app/api/admin/health/', reason: 'Release-health telemetry; read-only admin system' },
  { prefix: 'src/app/api/admin/integrity/', reason: 'Action-ledger integrity audit; read-only admin system' },
  { prefix: 'src/app/api/admin/invitations/', reason: 'Invitation provisioning; auth-admin write' },
  { prefix: 'src/app/api/admin/performance/', reason: 'Performance analytics; read-only admin system' },
  { prefix: 'src/app/api/admin/rep-performance/', reason: 'Rep performance analytics; read-only admin system' },
  { prefix: 'src/app/api/admin/scoring-', reason: 'Scoring QA/monitoring; read-only admin system' },
  { prefix: 'src/app/(app)/admin/health/', reason: 'Release-health page; read-only admin system' },
]

/** True when the file path is an allowlisted service-client call site. */
export function isAllowlistedServiceCall(file: string): boolean {
  return SERVICE_CLIENT_ALLOWLIST.some((entry) => file.startsWith(entry.prefix))
}
