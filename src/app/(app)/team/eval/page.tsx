import Link from 'next/link'
import { createScoutStore } from '@/lib/store'
import { ArrowLeft, Play, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function EvalPage() {
  const store = await createScoutStore()
  const runs = await store.listEvalRuns()
  const golden = await store.listGoldenSet()

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href="/team"
          className="inline-flex items-center gap-1.5 text-sm text-slate transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Team
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-medium tracking-tight text-ink">Eval harness</h1>
        <p className="mt-1 text-sm text-slate">
          Every prompt change gets scored against the golden set before it ships.
        </p>
      </div>

      <section className="rounded-2xl border border-line bg-paper p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-ink">Golden set</h2>
            <p className="mt-1 text-sm text-slate">
              {golden.length} curated case{golden.length === 1 ? '' : 's'} with known outcomes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <form action="/api/few-shot/refresh" method="POST">
              <Button variant="outline" size="sm" type="submit">
                <RefreshCw className="mr-1.5 size-3.5" />
                Refresh wins
              </Button>
            </form>
          </div>
        </div>

        {golden.length === 0 ? (
          <p className="mt-4 text-sm text-slate">
            No golden cases yet. Add them once real send and reply data exists in the log.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {golden.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-line bg-paper-tint/40 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {c.sentText.slice(0, 80)}
                    {c.sentText.length > 80 ? '…' : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-slate">
                    Known outcome:{' '}
                    <span className={c.knownReplied ? 'text-status-send' : 'text-status-no'}>
                      {c.knownReplied ? 'replied' : 'no reply'}
                    </span>
                    {c.note ? ` · ${c.note}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-paper p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-ink">Eval runs</h2>
            <p className="mt-1 text-sm text-slate">
              Previous prompt versions scored against the golden set.
            </p>
          </div>
          <form
            action="/api/eval/run"
            method="POST"
            onSubmit={async (e) => {
              e.preventDefault()
              const form = e.currentTarget
              const btn = form.querySelector('button')
              if (btn) btn.setAttribute('disabled', 'true')
              await fetch('/api/eval/run', { method: 'POST', body: JSON.stringify({ promptVersion: 'manual' }) })
              window.location.reload()
            }}
          >
            <Button variant="gold" size="sm" type="submit">
              <Play className="mr-1.5 size-3.5" />
              Run eval now
            </Button>
          </form>
        </div>

        {runs.length === 0 ? (
          <p className="mt-4 text-sm text-slate">
            No eval runs yet. Run one after the golden set has cases in it.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-slate">
                  <th className="pb-2 pr-4 font-medium">Version</th>
                  <th className="pb-2 pr-4 font-medium">Cases</th>
                  <th className="pb-2 pr-4 font-medium">Overall</th>
                  <th className="pb-2 pr-4 font-medium">Self-check pass</th>
                  <th className="pb-2 pr-4 font-medium">Reply rate</th>
                  <th className="pb-2 pr-4 font-medium">Company mention</th>
                  <th className="pb-2 font-medium">Evidence mention</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-line/50">
                    <td className="py-3 pr-4 font-mono text-xs text-ink">{r.promptVersion}</td>
                    <td className="py-3 pr-4 text-ink">{r.goldenSetSize}</td>
                    <td className="py-3 pr-4 font-medium text-gold">{r.overallScore}%</td>
                    <td className="py-3 pr-4 text-ink">{r.selfCheckPassRate}%</td>
                    <td className="py-3 pr-4 text-ink">{r.replyRateScore}%</td>
                    <td className="py-3 pr-4 text-ink">{r.companyMentionRate}%</td>
                    <td className="py-3 text-ink">{r.evidenceMentionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
