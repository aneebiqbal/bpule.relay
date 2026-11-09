/**
 * Service-boundary contracts.
 *
 * A logged-in user request must read and write through the authenticated RLS
 * client (`app.current_user_id` + policies). The service role is for cron,
 * signed webhooks, trusted reconciliation and migration/admin scripts — never
 * an implicit fallback in a request path.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/** Every file under a directory (recursive). */
function walk(dir: string): string[] {
  const out: string[] = []
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return out
  for (const entry of readdirSync(abs)) {
    const full = join(abs, entry)
    if (statSync(full).isDirectory()) out.push(...walk(join(dir, entry)))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(join(dir, entry))
  }
  return out
}

/**
 * Routes that legitimately need elevated access. Each entry is a substring of
 * the path; anything not matching must not import the service client.
 */
const SERVICE_ALLOWLIST = [
  // Trusted background jobs.
  'api/cron/',
  'api/eval/cron-run',
  'api/few-shot/refresh',
  'api/relay/reconcile',
  'api/trends/ingest',
  'api/admin/observability',
  // Signed webhooks / callbacks.
  'api/email/webhook',
  'api/email/mailbox/callback',
  // Auth bootstrap (no rep session yet).
  'api/auth/callback',
  'api/signup',
  'lib/auth/supabase-server',
  'lib/auth/invitations-server',
  // Trusted destructive admin operations.
  'api/organization/delete',
  // Cross-rep / cross-profile operational reads and ML shadow capture.
  'api/dataset/',
  'api/profile-intelligence/',
  'api/admin/performance',
  'api/admin/rep-performance',
  'api/admin/scoring-monitor',
  'api/admin/scoring-qa',
  'api/admin/scoring-integrity',
  'api/admin/integrity/',
  'api/admin/health',
  'api/admin/training-data',
  'api/admin/invitations',
  'api/prospect/analyze',
  'api/prospect/save',
  'api/upwork/extract',
  'api/leads/',
  'lib/scheduler/',
  'lib/admin/observability',
]

const USER_SURFACES = [
  'src/app/(app)/dashboard',
  'src/app/(app)/team/profiles',
  'src/app/(app)/team/coverage',
  'src/app/(app)/team/people',
  'src/app/(app)/tasks',
  'src/app/(app)/chats',
  'src/app/(app)/leads',
  'src/app/(app)/upwork',
  'src/app/(app)/reports',
  'src/app/(app)/content',
  'src/app/(app)/settings',
  'src/app/(app)/notifications',
  'src/app/(app)/performance',
  'src/app/(app)/team/',
]

describe('SERVICE_CLIENT_NOT_IMPORTED_BY_USER_REQUEST_ROUTES', () => {
  it('the core user surfaces do not import the service client', () => {
    const offenders: string[] = []
    for (const surface of USER_SURFACES) {
      for (const file of walk(surface)) {
        if (SERVICE_ALLOWLIST.some((allow) => file.includes(allow))) continue
        const source = read(file)
        if (/createServiceSupabase|createServiceSupabaseAuth|getNeonServicePool/.test(source)) {
          offenders.push(file)
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})

describe('ACTION_LEDGER_RUNTIME_IS_RLS_SCOPED', () => {
  it('emitAction defaults to the runtime client and never the service role', () => {
    const source = read('src/lib/action-ledger.ts')
    expect(source).not.toMatch(/createServiceSupabase/)
    expect(source).toMatch(/createServerSupabase/)
    expect(source).toMatch(/client\?: DbClient/)
  })

  it('the ledger client is injectable so cron can pass the service client explicitly', () => {
    expect(read('src/lib/action-ledger.ts')).toMatch(/params\.client/)
  })
})

describe('ORG_CLOCK_RUNTIME_IS_RLS_SCOPED', () => {
  it('loadOperatingPolicy defaults to the runtime client', () => {
    const source = read('src/lib/org-clock/load.ts')
    expect(source).not.toMatch(/createServiceSupabase/)
    expect(source).toMatch(/await createServerSupabase\(\)/)
  })
})

describe('SERVICE_DATABASE_URL_NEVER_REQUIRED_FOR_NORMAL_PAGES', () => {
  it('the runtime pool resolves DATABASE_URL only', () => {
    const source = read('src/lib/db/neon.ts')
    expect(source).toMatch(/getNeonPool[\s\S]{0,400}DATABASE_URL/)
    expect(source).not.toMatch(/getNeonPool[\s\S]{0,400}SERVICE_DATABASE_URL/)
  })

  it('the service pool is a separate, explicit resolver', () => {
    expect(read('src/lib/db/neon.ts')).toMatch(/getNeonServicePool[\s\S]{0,400}SERVICE_DATABASE_URL/)
  })
})

describe('CRON_AND_WEBHOOK_SERVICE_ACCESS_EXPLICIT', () => {
  it('cron routes gate on the cron secret and use the service client explicitly', () => {
    const source = read('src/app/api/cron/archive-stale-leads/route.ts')
    expect(source).toMatch(/requireCronSecret/)
    expect(source).toMatch(/createServiceSupabase/)
  })

  it('webhook routes verify a signature/secret, not a rep session', () => {
    const source = read('src/app/api/email/webhook/route.ts')
    expect(source).toMatch(/webhook-secret|WEBHOOK_SECRET|signature/)
  })
})

describe('PROFILE_ARCHITECTURE_UNCHANGED', () => {
  it('the person-first model and channel contracts remain', () => {
    expect(read('supabase/migrations/20261109010000_profile_person.sql')).toMatch(/person_id/)
    expect(read('tests/profile-operating-contracts.test.ts')).toMatch(/ADD_CHANNEL_DOES_NOT_CREATE_PERSON/)
  })
})
