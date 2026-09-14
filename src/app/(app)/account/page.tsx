import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  User,
  Building2,
  Sparkles,
  ChevronRight,
  Shield,
  Palette,
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
  const sendsLeft = totalLimit - totalUsed

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-display text-[28px] text-ink">Account</h1>
        <p className="text-[14px] text-graphite mt-1">Your profile, plan, and usage.</p>
      </header>

      {/* Plan card */}
      <section className="rounded-xl border border-line bg-bone-raised overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-orange/10">
              <Shield className="size-4 text-orange" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-ink">
                {planLabel} plan
              </p>
              <p className="text-[12px] text-graphite">{user.organization.name}</p>
            </div>
          </div>
          <span className="rounded-full bg-ink px-2.5 py-1 text-mono-medium text-[10px] text-bone">
            {planLabel.toUpperCase()}
          </span>
        </div>
      </section>

      {/* Usage */}
      <section className="space-y-3">
        <h2 className="text-label text-stone">Usage</h2>
        <div className="rounded-xl border border-line bg-bone-raised p-5 space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-[14px] font-medium text-ink">Sends</p>
              <p className="text-mono-medium text-[13px] text-ink">
                {totalUsed} / {totalLimit}
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bone">
              <div
                className="h-full rounded-full bg-orange transition-all duration-500"
                style={{ width: `${Math.min((totalUsed / totalLimit) * 100, 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[12px] text-graphite">
              {sendsLeft > 0 ? `${sendsLeft} sends remaining today` : 'Daily limit reached'} · Resets at midnight
            </p>
          </div>
        </div>
      </section>

      {/* Profile */}
      <section className="space-y-3">
        <h2 className="text-label text-stone">Profile</h2>
        <div className="rounded-xl border border-line bg-bone-raised divide-y divide-line">
          <div className="flex items-center gap-3 px-5 py-3.5">
            <User className="size-4 text-stone" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-graphite">Name</p>
              <p className="text-[14px] font-medium text-ink truncate">{user.rep.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-5 py-3.5">
            <Building2 className="size-4 text-stone" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-graphite">Organization</p>
              <p className="text-[14px] font-medium text-ink truncate">{user.organization.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-5 py-3.5">
            <Shield className="size-4 text-stone" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-graphite">Role</p>
              <p className="text-[14px] font-medium text-ink capitalize">{user.rep.role}</p>
            </div>
          </div>
          <Link
            href="/onboarding"
            className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-bone"
          >
            <Sparkles className="size-4 text-orange" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-graphite">Voice calibration</p>
              <p className="text-[14px] font-medium text-ink">
                {user.profile ? 'Calibrated' : 'Not calibrated'}
              </p>
            </div>
            <ChevronRight className="size-4 text-stone" />
          </Link>
        </div>
      </section>

      {/* Preferences */}
      <section className="space-y-3">
        <h2 className="text-label text-stone">Preferences</h2>
        <div className="rounded-xl border border-line bg-bone-raised">
          <div className="flex items-center gap-3 px-5 py-3.5">
            <Palette className="size-4 text-stone" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-[13px] text-graphite">Appearance</p>
              <p className="text-[14px] font-medium text-ink">Theme</p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </section>

      {/* Actions */}
      <section className="space-y-3">
        <h2 className="text-label text-stone">Actions</h2>
        <div className="rounded-xl border border-line bg-bone-raised">
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
        </div>
      </section>
    </div>
  )
}
