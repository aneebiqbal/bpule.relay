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
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="space-y-1">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Account / usage</p>
        <h1 className="text-[30px] font-medium tracking-[-0.03em] text-ink">Today&apos;s operating usage</h1>
        <p className="text-[13px] text-graphite">Keep execution inside your daily limits while moving meaningful work forward.</p>
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

      <Link href="/account" className="inline-flex items-center gap-2 text-[12px] font-medium text-ink">
        Open full account settings
      </Link>
    </div>
  )
}
