import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { ArrowLeft, Play, RefreshCw, Database, FlaskConical } from 'lucide-react'
import { cn } from 'cn'

export const dynamic = 'force-dynamic'

export default async function EvalPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const [runsRes, goldenRes] = await Promise.allSettled([
    store.listEvalRuns(),
    store.listGoldenSet(),
  ])
  const runs = runsRes.status === 'fulfilled' ? runsRes.value : []
  const golden = goldenRes.status === 'fulfilled' ? goldenRes.value : []

  return (
    <div className="space-y-8">
      {/* Back nav */}
      <div className="reveal-up">
        <Link
          href="/team"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate transition-colors hover:bg-paper-tint hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Team
        </Link>
      </div>

      {/* Header */}
      <header className="reveal-up stagger-1 space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-slate">Quality assurance</p>
        <h1 className="text-3xl font-medium tracking-tight text-ink sm:text-4xl">Eval harness</h1>
        <p className="max-w-xl text-sm leading-relaxed text-slate">
          Every prompt change gets scored against the golden set before it ships.
        </p>
        {runsRes.status === 'rejected' || goldenRes.status === 'rejected' ? (
          <p className="text-xs text-status-research">
            Some eval data is unavailable right now. Showing what could be loaded.
          </p>
        ) : null}
      </header>

      {/* Golden set */}
      <section className="reveal-up stagger-2 rounded-2xl border border-line bg-paper p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gold/10">
              <Database className="size-4 text-gold" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-medium text-ink">Golden set</h2>
              <p className="text-sm text-slate">
                {golden.length} curated case{golden.length === 1 ? '' : 's'} with known outcomes.
              </p>
            </div>
          </div>
          <form action="/api/few-shot/refresh" method="POST">
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[0.8rem] font-medium text-ink transition-colors hover:bg-paper-tint"
            >
              <RefreshCw className="mr-1.5 size-3.5" />
              Refresh wins
            </button>
          </form>
        </div>

        {golden.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-line py-8 text-center">
            <p className="text-sm text-slate">
              No golden cases yet. Add them once real send and reply data exists in the log.
            </p>
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-line border-t border-line">
            {golden.map((c, i) => (
              <li
                key={c.id}
                className="slide-in-right flex items-start justify-between gap-4 py-4"
                style={{ animationDelay: `${0.05 + i * 0.04}s` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    {c.sentText.slice(0, 80)}
                    {c.sentText.length > 80 ? '…' : ''}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                        c.knownReplied
                          ? 'bg-status-send/10 text-status-send'
                          : 'bg-status-no/10 text-status-no',
                      )}
                    >
                      {c.knownReplied ? 'Replied' : 'No reply'}
                    </span>
                    {c.note && <span className="text-xs text-slate">{c.note}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Eval runs */}
      <section className="reveal-up stagger-3 rounded-2xl border border-line bg-paper p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-ink/5">
              <FlaskConical className="size-4 text-ink/60" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-medium text-ink">Eval runs</h2>
              <p className="text-sm text-slate">
                Previous prompt versions scored against the golden set.
              </p>
            </div>
          </div>
          <form
            action="/api/eval/run"
            method="POST"
          >
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gold px-3 text-[0.8rem] font-medium text-paper transition-colors hover:bg-gold/90"
            >
              <Play className="mr-1.5 size-3.5" />
              Run eval now
            </button>
          </form>
        </div>

        {runs.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-line py-8 text-center">
            <p className="text-sm text-slate">
              No eval runs yet. Run one after the golden set has cases in it.
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                  <th className="pb-3 pr-4 font-medium">Version</th>
                  <th className="pb-3 pr-4 font-medium">Cases</th>
                  <th className="pb-3 pr-4 font-medium">Overall</th>
                  <th className="pb-3 pr-4 font-medium">Self-check</th>
                  <th className="pb-3 pr-4 font-medium">Reply</th>
                  <th className="pb-3 pr-4 font-medium">Company</th>
                  <th className="pb-3 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr
                    key={r.id}
                    className="slide-in-right border-b border-line/40 transition-colors hover:bg-paper-tint/30"
                    style={{ animationDelay: `${0.05 + i * 0.03}s` }}
                  >
                    <td className="py-3.5 pr-4 font-mono text-xs text-ink">{r.promptVersion}</td>
                    <td className="py-3.5 pr-4 text-ink">{r.goldenSetSize}</td>
                    <td className="py-3.5 pr-4 font-medium text-gold">{r.overallScore}%</td>
                    <td className="py-3.5 pr-4 text-ink">{r.selfCheckPassRate}%</td>
                    <td className="py-3.5 pr-4 text-ink">{r.replyRateScore}%</td>
                    <td className="py-3.5 pr-4 text-ink">{r.companyMentionRate}%</td>
                    <td className="py-3.5 text-ink">{r.evidenceMentionRate}%</td>
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
