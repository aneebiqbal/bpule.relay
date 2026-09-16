import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { RevenueIdentityManager } from '@/components/revenue-identity-manager'

export const dynamic = 'force-dynamic'

export default async function RevenueIdentitiesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.rep.role !== 'admin') redirect('/dashboard')

  return (
    <div className="space-y-5">
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Admin / Revenue Identities</p>
        <h1 className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">
          Define company-owned identities once.
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--console-mute)]">
          Admin owns identity truth and assignment. Reps execute only from the identities mapped to them.
        </p>
      </section>
      <RevenueIdentityManager />
    </div>
  )
}
