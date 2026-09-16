import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { FactsManager } from '@/components/facts-manager'


export const dynamic = 'force-dynamic'

export default async function FactsPage() {
  const user = await getCurrentUser()
  const store = await createScoutStore()
  const facts = await store.listFacts()
  const isAdmin = (user?.rep.role ?? 'rep') === 'admin'
  const typeCount = new Set(facts.map((fact) => fact.factType ?? 'uncategorized')).size

  return (
    <div className="space-y-5">
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Measurement / Fact Guardrails</p>
        <h1 className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">
          Control what claims are legally and operationally safe.
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--console-mute)]">
          Draft output can only use approved facts stored here. Everything else is stripped before a human sees the message.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <FactStat label="Approved facts" value={facts.length} />
          <FactStat label="Fact groups" value={typeCount} />
          <FactStat label="Permissions" value={isAdmin ? 'Admin editable' : 'Read only'} />
        </div>
      </section>
      <FactsManager initialFacts={facts} isAdmin={isAdmin} />
    </div>
  )
}

function FactStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-orange/20 bg-orange/5 px-3 py-2">
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-orange-light/80">{label}</p>
      <p className="mt-1 text-[18px] font-medium text-[color:var(--console-text)]">{value}</p>
    </div>
  )
}
