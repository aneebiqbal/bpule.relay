import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  User,
  Building2,
  Sparkles,
  ChevronRight,
  Shield,
  Palette,
  Gauge,
  ArrowRight,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { ThemeToggle } from '@/components/theme-toggle'
import { SignOutButton } from '@/components/sign-out-button'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const queue = await store.getTodayDashboard()

  const planLabel = user.organization.plan === 'active' ? 'Pro' : user.organization.plan === 'trial' ? 'Free' : 'Free'
  const totalLimit = queue.sendBudgets.reduce((s, b) => s + b.limit, 0)
  const totalUsed = queue.sendBudgets.reduce((s, b) => s + b.used, 0)
  const sendsLeft = Math.max(0, totalLimit - totalUsed)
  const usagePct = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Identity / Account</p>
        <h1 className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">
          Keep execution inside your operating limits.
        </h1>
        <p className="mt-2 text-[13px] text-[color:var(--console-mute)]">
          Relay tracks usage by day so your team can prioritize meaningful sends.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded border border-orange/20 bg-orange/5 px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange-light/80">Plan</p>
            <p className="mt-1 text-[18px] font-medium text-[color:var(--console-text)]">{planLabel}</p>
          </div>
          <div className="rounded border border-orange/20 bg-orange/5 px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange-light/80">Role</p>
            <p className="mt-1 text-[18px] font-medium capitalize text-[color:var(--console-text)]">{user.rep.role}</p>
          </div>
          <div className="rounded border border-orange/20 bg-orange/5 px-3 py-2">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange-light/80">Sends Left Today</p>
            <p className="mt-1 text-[18px] font-medium text-[color:var(--console-text)]">{sendsLeft}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <p className="text-[12px] text-[color:var(--console-mute)]">Daily send budget</p>
            <p className="text-[12px] text-[color:var(--console-text)]">{totalUsed} / {totalLimit}</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded bg-line/30">
            <div
              className="h-full rounded bg-orange transition-all"
              style={{ width: `${Math.min(100, Math.max(4, usagePct))}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] text-[color:var(--console-mute)]">
            {sendsLeft > 0 ? `${sendsLeft} sends remaining` : 'Daily limit reached'} · resets at midnight
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/usage"
            className="inline-flex items-center gap-1.5 rounded border border-orange/30 bg-orange/10 px-3 py-1.5 text-[12px] font-medium text-[color:var(--console-text)]"
          >
            Open detailed usage
            <ArrowRight className="size-3.5" />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded border border-line/30 px-3 py-1.5 text-[12px] font-medium text-[color:var(--console-mute)] hover:text-[color:var(--console-text)]"
          >
            Return to Relay Today
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded border border-line bg-bone-raised">
          <div className="border-b border-line px-4 py-3">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Identity Record</p>
          </div>
          <div className="divide-y divide-line">
            <div className="flex items-center gap-3 px-4 py-3">
              <User className="size-4 text-stone" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-graphite">Name</p>
                <p className="truncate text-[14px] font-medium text-ink">{user.rep.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <Building2 className="size-4 text-stone" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-graphite">Organization</p>
                <p className="truncate text-[14px] font-medium text-ink">{user.organization.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <Shield className="size-4 text-stone" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-graphite">Role guardrail</p>
                <p className="text-[14px] font-medium text-ink">
                  {user.rep.role === 'admin' ? 'Admin owns identity truth and assignments' : 'Rep executes from assigned identities'}
                </p>
              </div>
            </div>
          </div>
        </article>

        <article className="srf-proof px-4 py-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
            <Gauge className="size-3.5 text-orange" />
            Calibration
          </div>
          <p className="mt-2 text-[12px] text-graphite">
            Voice settings shape draft tone. Keep this current as your positioning changes.
          </p>
          <Link
            href="/onboarding"
            className="mt-3 inline-flex items-center gap-1.5 rounded border border-line bg-bone px-2.5 py-1.5 text-[12px] font-medium text-ink hover:bg-bone-raised"
          >
            <Sparkles className="size-3.5 text-orange" aria-hidden="true" />
            {user.profile ? 'Review voice calibration' : 'Finish voice calibration'}
            <ChevronRight className="size-3.5 text-stone" />
          </Link>
        </article>
      </section>

      <section className="rounded border border-line bg-bone-raised">
        <div className="flex items-center gap-3 px-4 py-3">
          <Palette className="size-4 text-stone" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-[12px] text-graphite">Appearance</p>
            <p className="text-[14px] font-medium text-ink">Theme</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section className="rounded border border-line bg-bone-raised">
        <Link
          href="/pricing"
          className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-bone"
        >
          <Shield className="size-4 text-stone" aria-hidden="true" />
          <span className="flex-1 text-[14px] text-ink">View plans</span>
          <ChevronRight className="size-4 text-stone" />
        </Link>
        <div className="border-t border-line" />
        <SignOutButton />
      </section>
    </div>
  )
}
