import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { CommandCenter } from '@/components/command-center'

export const dynamic = 'force-dynamic'

export default async function CommandCenterPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.rep.role !== 'admin') redirect('/dashboard')

  return (
    <div className="space-y-8">
      <header className="reveal-up space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Founder command</p>
        <h1 className="text-3xl font-medium tracking-tight text-ink sm:text-4xl">Where the team needs attention</h1>
        <p className="max-w-xl text-sm leading-relaxed text-slate">
          Exceptions first. Accountability next. Resolve what is blocking revenue execution today.
        </p>
      </header>
      <CommandCenter />
    </div>
  )
}
