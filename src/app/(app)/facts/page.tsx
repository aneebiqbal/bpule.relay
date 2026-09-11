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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">Facts</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate">
          The only numbers and claims the draft model is allowed to use. Anything not in this
          table is stripped out of generated copy, in code, before it ever reaches a human eye.
        </p>
      </header>
      <FactsManager initialFacts={facts} isAdmin={isAdmin} />
    </div>
  )
}