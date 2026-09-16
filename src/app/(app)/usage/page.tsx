import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export default async function UsagePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const queue = await store.getTodayDashboard()

  const totalLimit = queue.sendBudgets.reduce((sum, budget) => sum + budget.limit, 0)
  const totalUsed = queue.sendBudgets.reduce((sum, budget) => sum + budget.used, 0)
  const remaining = Math.max(0, totalLimit - totalUsed)
  const pct = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Account / Usage</p>
        <h1 className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">Track send capacity before you execute.</h1>
        <p className="mt-2 text-[13px] text-[color:var(--console-mute)]">Daily budgets reset at midnight. Prioritize high-intent actions first.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <UsageSignal label="Used" value={totalUsed} />
          <UsageSignal label="Limit" value={totalLimit} />
          <UsageSignal label="Remaining" value={remaining} />
        </div>
      </header>

      <section className="rounded border border-line bg-bone-raised px-4 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Sends</p>
            <p className="mt-1 text-[28px] font-medium tracking-[-0.03em] text-ink">{totalUsed} / {totalLimit}</p>
          </div>
          <p className="text-[12px] text-graphite">{remaining} remaining</p>
        </div>
        <div className="mt-3 h-2 rounded bg-line/60">
          <div className="h-full rounded bg-orange" style={{ width: `${Math.min(100, Math.max(4, pct))}%` }} />
        </div>
        <div className="mt-3 space-y-1 text-[12px] text-graphite">
          {queue.sendBudgets.map((budget) => (
            <p key={budget.label}>{budget.label}: {budget.used} / {budget.limit}</p>
          ))}
        </div>
      </section>

      <Link href="/account" className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone">
        Open full account settings
      </Link>
    </div>
  )
}

function UsageSignal({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-orange/20 bg-orange/5 px-3 py-2">
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange-light/80">{label}</p>
      <p className="mt-1 text-[20px] font-medium text-[color:var(--console-text)]">{value}</p>
    </div>
  )
}
