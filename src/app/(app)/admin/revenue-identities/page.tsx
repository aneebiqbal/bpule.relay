import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { RevenueIdentityManager } from '@/components/revenue-identity-manager'

export const dynamic = 'force-dynamic'

export default async function RevenueIdentitiesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.rep.role !== 'admin') redirect('/dashboard')

  return (
    <div className="space-y-8">
      <header className="reveal-up space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Administration</p>
        <h1 className="text-3xl font-medium tracking-tight text-ink sm:text-4xl">Revenue Identities</h1>
        <p className="max-w-xl text-sm leading-relaxed text-slate">
          Company-owned identities that reps execute from. Admins create, edit, and assign. Reps can only use what is assigned to them.
        </p>
      </header>
      <RevenueIdentityManager />
    </div>
  )
}
