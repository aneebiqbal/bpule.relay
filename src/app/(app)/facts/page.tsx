import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { FactsManager } from '@/components/facts-manager'


export const dynamic = 'force-dynamic'

export default async function FactsPage() {
  const user = await getCurrentUser()
  const store = await createScoutStore()
  const facts = await store.listFacts()
  const isAdmin = (user?.rep.role ?? 'rep') === 'admin'

  return (
    <div className="space-y-8">
      <header className="reveal-up space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Knowledge base</p>
        <h1 className="text-3xl font-medium tracking-tight text-ink sm:text-4xl">Facts</h1>
        <p className="max-w-xl text-sm leading-relaxed text-slate">
          The only numbers and claims the draft model is allowed to use. Anything not in this
          table is stripped out of generated copy, in code, before it ever reaches a human eye.
        </p>
      </header>
      <FactsManager initialFacts={facts} isAdmin={isAdmin} />
    </div>
  )
}
