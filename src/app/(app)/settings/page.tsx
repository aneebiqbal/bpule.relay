import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Building2, Clock, Palette, Shield, Sparkles, User,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { isProductAdmin } from '@/lib/auth/admin-page'
import { createScoutStore } from '@/lib/store'
import { ThemeToggle } from '@/components/theme-toggle'
import { SignOutButton } from '@/components/sign-out-button'
import { DashHeader, Meter, Panel, Pill } from '@/components/dashboard/kit'
import { OperatingHours } from '@/components/admin/operating-hours'
import { SendLimits } from '@/components/admin/send-limits'
import { SendingPolicy, type SendingPolicyInitial } from '@/components/admin/sending-policy'
import { loadOperatingPolicy } from '@/lib/org-clock/load'

export const dynamic = 'force-dynamic'

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', rep: 'Rep', sourcer: 'Sourcer', manager: 'Manager' }

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const authCtx = await getAuthContext()
  const isAdmin = isProductAdmin(user, authCtx)

  const policy = authCtx ? await loadOperatingPolicy(authCtx.orgId).catch(() => null) : null

  const store = await createScoutStore()
  const queue = await store.getTodayDashboard().catch(() => null)
  const budgets = queue?.sendBudgets ?? []
  const totalLimit = budgets.reduce((sum, b) => sum + b.limit, 0)
  const totalUsed = budgets.reduce((sum, b) => sum + b.used, 0)
  const remaining = Math.max(0, totalLimit - totalUsed)

  const effective = await store.getEffectivePolicy()
  const sendLimits = {
    dailySendLimit: effective.budgets.dmFollowup.limit,
    dailyConnectionLimit: effective.budgets.connection.limit,
  }

  // The sending policy reads both email authorities: the org policy owns
  // autonomy and safety, the per-mailbox policy owns the email ceiling, window
  // and follow-up count. Both are shown, because both are enforced.
  const sendingPolicy: SendingPolicyInitial = await loadSendingPolicy(authCtx?.orgId)

  const planLabel = user.organization.plan === 'active' ? 'Pro' : 'Free'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <DashHeader eyebrow="Account" title="Settings" subtitle="Your account, today’s send budget and how Relay looks." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Panel className="md:col-span-3" title="Your account" flush>
          <dl className="divide-y divide-line/70">
            <Row icon={<User className="size-4" />} label="Name" value={user.rep.name} />
            <Row icon={<Shield className="size-4" />} label="Role" value={<Pill tone={isAdmin ? 'orange' : 'cobalt'}>{ROLE_LABEL[user.rep.role] ?? user.rep.role}</Pill>} />
            <Row icon={<Building2 className="size-4" />} label="Organization" value={<span className="flex items-center gap-2">{user.organization.name}<Pill>{planLabel}</Pill></span>} />
            <Row icon={<Clock className="size-4" />} label="Timezone" value={user.rep.timezone || 'UTC'} />
          </dl>
        </Panel>

        <div className="space-y-4 md:col-span-2">
          <Panel title="Appearance">
            <div className="flex items-center gap-3">
              <Palette className="size-4 text-stone" aria-hidden="true" />
              <p className="flex-1 text-[13px] text-ink">Light or dark theme</p>
              <ThemeToggle />
            </div>
          </Panel>
          <Panel title="Writing voice" subtitle="Shapes the tone of every draft">
            <div className="flex items-center gap-2 rounded-md border border-line bg-bone px-3 py-2 text-[12px] font-medium text-ink">
              <Sparkles className="size-3.5 text-orange" aria-hidden="true" />
              <span className="flex-1">Voice calibration not available yet</span>
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        id="send-budget"
        title="Today’s send budget"
        subtitle="Daily limits keep accounts safe. They reset at midnight."
        action={<span className="text-[13px] font-medium tabular-nums text-ink">{totalUsed}<span className="text-stone"> / {totalLimit}</span></span>}
      >
        {budgets.length === 0 ? (
          <p className="text-[12px] text-stone">No send limits configured.</p>
        ) : (
          <div className="space-y-4">
            <Meter value={totalUsed} max={totalLimit} tone={remaining === 0 ? 'warning' : 'orange'} className="h-2" />
            <p className="text-[12px] text-graphite">{remaining > 0 ? `${remaining} sends left today. Spend them on replies and high-fit leads first.` : 'Daily limit reached — sends unlock at midnight.'}</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {budgets.map((b) => (
                <li key={b.label} className="rounded-lg border border-line/70 bg-bone px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-graphite">{b.label}</span>
                    <span className="font-medium tabular-nums text-ink">{b.used}<span className="text-stone">/{b.limit}</span></span>
                  </div>
                  <Meter value={b.used} max={b.limit} tone={b.used >= b.limit ? 'warning' : 'cobalt'} className="h-1" />
                </li>
              ))}
            </ul>

            {isAdmin && (
              <div className="pt-1">
                <SendLimits initial={sendLimits} />
              </div>
            )}
          </div>
        )}
      </Panel>

      {isAdmin && policy && <OperatingHours initial={policy} />}

      {isAdmin && (
        <SendingPolicy initial={sendingPolicy} />
      )}

      <Panel flush>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-5 py-3 text-[12px]">
          <Link href="/docs" className="text-graphite hover:text-ink">Docs</Link>
          <Link href="/pricing" className="text-graphite hover:text-ink">Plans</Link>
          <Link href="/privacy" className="text-graphite hover:text-ink">Privacy</Link>
          <Link href="/terms" className="text-graphite hover:text-ink">Terms</Link>
        </div>
        <SignOutButton />
      </Panel>
    </div>
  )
}

/**
 * Read both email authorities so the panel shows the enforced values.
 *
 * An absent table (migration not yet applied) resolves to the safe defaults
 * rather than failing the settings page.
 */
async function loadSendingPolicy(orgId: string | undefined): Promise<SendingPolicyInitial> {
  if (!orgId) return DEFAULT_SENDING_POLICY

  const client = await createServerSupabase()
  const [emailPolicyResult, mailboxResult, orgResult] = await Promise.all([
    client.from('organization_email_policy').select('*').eq('organization_id', orgId).maybeSingle(),
    client
      .from('email_sending_policies')
      .select('daily_send_cap, minimum_delay_seconds, working_hours_start, working_hours_end, follow_up_limit')
      .eq('organization_id', orgId)
      .limit(1),
    client.from('organizations').select('settings').eq('id', orgId).maybeSingle(),
  ])

  const policy = (emailPolicyResult.data ?? null) as Record<string, unknown> | null
  const mailbox = ((mailboxResult.data ?? [])[0] ?? null) as Record<string, unknown> | null
  const settings = ((orgResult.data?.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>

  const fallback = DEFAULT_SENDING_POLICY
  return {
    enabled: policy ? policy.enabled !== false : fallback.enabled,
    autonomyMode: isMode(policy?.autonomy_mode) ? (policy?.autonomy_mode as SendingPolicyInitial['autonomyMode']) : fallback.autonomyMode,
    linkedinAutonomyMode: isMode(settings.linkedinAutonomyMode) ? (settings.linkedinAutonomyMode as SendingPolicyInitial['autonomyMode']) : fallback.linkedinAutonomyMode,
    upworkAutonomyMode: isMode(settings.upworkAutonomyMode) ? (settings.upworkAutonomyMode as SendingPolicyInitial['autonomyMode']) : fallback.upworkAutonomyMode,
    dailySendCap: asInt(mailbox?.daily_send_cap) ?? fallback.dailySendCap,
    hourlySendCap: asInt(policy?.hourly_send_cap) ?? fallback.hourlySendCap,
    minimumSpacingMinutes: spacingMinutes(asInt(mailbox?.minimum_delay_seconds)),
    workingHoursStart: asInt(mailbox?.working_hours_start) ?? fallback.workingHoursStart,
    workingHoursEnd: asInt(mailbox?.working_hours_end) ?? fallback.workingHoursEnd,
    followUpLimit: asInt(mailbox?.follow_up_limit) ?? fallback.followUpLimit,
    consecutiveFailureThreshold: asInt(policy?.consecutive_failure_threshold) ?? fallback.consecutiveFailureThreshold,
    bounceThresholdPercent: (asInt(policy?.bounce_threshold) ?? fallback.bounceThresholdPercent / 10) * 10,
  }
}

const DEFAULT_SENDING_POLICY: SendingPolicyInitial = {
  enabled: true,
  autonomyMode: 'APPROVAL_REQUIRED',
  linkedinAutonomyMode: 'APPROVAL_REQUIRED',
  upworkAutonomyMode: 'APPROVAL_REQUIRED',
  dailySendCap: 25,
  hourlySendCap: 5,
  minimumSpacingMinutes: 4,
  workingHoursStart: 9,
  workingHoursEnd: 17,
  followUpLimit: 2,
  consecutiveFailureThreshold: 3,
  bounceThresholdPercent: 50,
}

function isMode(value: unknown): value is SendingPolicyInitial['autonomyMode'] {
  return value === 'MANUAL' || value === 'APPROVAL_REQUIRED' || value === 'AUTOPILOT'
}

function asInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function spacingMinutes(seconds: number | null): number {
  if (seconds === null || seconds <= 0) return DEFAULT_SENDING_POLICY.minimumSpacingMinutes
  return Math.max(1, Math.round(seconds / 60))
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="text-stone" aria-hidden="true">{icon}</span>
      <dt className="w-28 shrink-0 text-[12px] text-graphite">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{value}</dd>
    </div>
  )
}


