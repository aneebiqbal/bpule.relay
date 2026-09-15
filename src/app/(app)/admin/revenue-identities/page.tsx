import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { RevenueIdentitiesManager } from '@/components/admin/revenue-os/identities-manager'

export const dynamic = 'force-dynamic'

export default async function RevenueIdentitiesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.rep.role !== 'admin') redirect('/')

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-label text-stone">Revenue Operations</p>
        <h1 className="text-display text-2xl text-ink">Revenue Identities</h1>
        <p className="text-[13px] text-graphite max-w-xl">
          Create and manage company-controlled revenue identities. Assign them to reps and set daily targets.
          Reps can only see identities you explicitly assign to them.
        </p>
      </header>
      <RevenueIdentitiesManager />
    </div>
  )
}
