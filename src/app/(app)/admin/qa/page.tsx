'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { cn } from 'cn'

type Section =
  | 'routing' | 'staleness' | 'threads' | 'model-comparison'
  | 'funnel' | 'messages' | 'theses'

interface RoutingRow {
  leadId: string
  company: string
  currentSenderId: string | null
  currentSenderName: string | null
  v1: { senderId: string | null; name: string | null; match: number | null }
  v2: { senderId: string | null; name: string | null; match: number | null }
  agree: boolean
  flags: string[]
  proofUsed: boolean
  platformMatch: boolean
  scoreGap: number | null
}

interface Staleness {
  total: number; current: number; stale: number; unscored: number
  staleByVersion: Record<string, number>; oldestStaleAt: string | null; maxStaleAgeDays: number | null
}

interface ThreadRow { id: string; lead_id: string; sent_text: string | null; sent_at: string | null; sender_profile_id: string | null }

interface SampleRow { id: string; lead_id?: string; type?: string; direction?: string; sent_text?: string | null; company?: string; contact_name?: string | null; contact_title?: string | null; canonical_intelligence?: unknown }

const FLAG_LABEL: Record<string, string> = {
  V1_V2_DISAGREE: 'V1/V2 disagree', BEST_SENDER_INACCESSIBLE: 'Best sender inaccessible',
  NO_VERIFIED_PROOF: 'No verified proof', CURRENT_SENDER_UNKNOWN: 'Current sender unknown', PLATFORM_MISMATCH: 'Platform mismatch',
}

const TABS: Array<{ id: Section; label: string }> = [
  { id: 'routing', label: 'Routing v1/v2' },
  { id: 'staleness', label: 'Score staleness' },
  { id: 'threads', label: 'Thread trust' },
  { id: 'model-comparison', label: 'Model comparison' },
  { id: 'funnel', label: 'Revenue funnel' },
  { id: 'messages', label: 'Message review' },
  { id: 'theses', label: 'Thesis review' },
]

export default function AdminQaPage() {
  const [section, setSection] = useState<Section>('routing')
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [routingFilter, setRoutingFilter] = useState('all')
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const res = await fetch('/api/admin/qa-views?section=all', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setState('ready')
    } catch { setState('error') }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = useCallback(async (kind: string, body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/qa/evaluations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, ...body }),
    })
    if (res.ok) setSaved(kind)
    else setSaved('error')
  }, [])

  const routingRows = useMemo(() => {
    const rows = (data?.routing as { rows: RoutingRow[] } | undefined)?.rows ?? []
    switch (routingFilter) {
      case 'disagreement': return rows.filter((r) => r.flags.includes('V1_V2_DISAGREE'))
      case 'no-proof': return rows.filter((r) => r.flags.includes('NO_VERIFIED_PROOF'))
      case 'inaccessible': return rows.filter((r) => r.flags.includes('BEST_SENDER_INACCESSIBLE'))
      case 'platform': return rows.filter((r) => r.flags.includes('PLATFORM_MISMATCH'))
      case 'unreviewed': return rows.filter((r) => !r.agree)
      default: return rows
    }
  }, [data, routingFilter])

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Relay / Admin QA</p>
        <h1 className="text-display text-[28px] font-light tracking-[-0.02em] text-ink">Review &amp; trust</h1>
        <p className="text-[13px] text-graphite">Human review of routing, staleness, threads, messages and theses. Nothing here promotes a model.</p>
      </header>

      <div role="tablist" aria-label="QA sections" className="flex flex-wrap gap-1 rounded-lg bg-bone-raised p-1">
        {TABS.map((t) => (
          <button
            key={t.id} role="tab" aria-selected={section === t.id} onClick={() => setSection(t.id)}
            className={cn('rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors', section === t.id ? 'bg-solid text-on-solid' : 'text-graphite hover:text-ink')}
          >
            {t.label}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-graphite hover:text-ink">
          <RefreshCw className={cn('size-3.5', state === 'loading' && 'animate-spin')} aria-hidden="true" /> Refresh
        </button>
      </div>

      {saved && <p role="status" className={cn('text-[12px]', saved === 'error' ? 'text-status-danger' : 'text-status-success')}>{saved === 'error' ? 'Could not save that review.' : 'Review saved.'}</p>}

      {state === 'loading' && <div className="space-y-2" aria-busy="true" aria-label="Loading QA data">{[0, 1, 2].map((i) => <div key={i} className="h-9 rounded-lg bg-bone-raised" />)}</div>}
      {state === 'error' && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-status-danger/30 bg-status-danger/5 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden="true" />
          <div><p className="text-[13px] font-medium text-ink">QA data could not load.</p><p className="mt-0.5 text-[12px] text-graphite">Check your admin access and refresh.</p></div>
        </div>
      )}

      {state === 'ready' && section === 'routing' && (
        <RoutingSection rows={routingRows} filter={routingFilter} onFilter={setRoutingFilter} onSave={save} />
      )}
      {state === 'ready' && section === 'staleness' && <StalenessSection data={data?.staleness as Staleness | undefined} />}
      {state === 'ready' && section === 'threads' && <ThreadsSection data={data?.threads as { threads: ThreadRow[]; unavailable: boolean } | undefined} onSave={save} />}
      {state === 'ready' && section === 'model-comparison' && <ModelComparisonSection data={data?.modelComparison as Record<string, unknown> | undefined} />}
      {state === 'ready' && section === 'funnel' && <FunnelSection data={data?.funnel as Record<string, number> | undefined} />}
      {state === 'ready' && section === 'messages' && <MessageReviewSection data={data?.messageSample as { messages: SampleRow[]; unavailable: boolean } | undefined} stats={data?.messageStats as Record<string, number> | undefined} onSave={save} />}
      {state === 'ready' && section === 'theses' && <ThesisReviewSection data={data?.thesisSample as { theses: SampleRow[]; unavailable: boolean } | undefined} stats={data?.thesisStats as Record<string, number> | undefined} onSave={save} />}
    </div>
  )
}

/* ── Routing ─────────────────────────────────────────────────────────────── */

function RoutingSection({ rows, filter, onFilter, onSave }: { rows: RoutingRow[]; filter: string; onFilter: (f: string) => void; onSave: (k: string, b: Record<string, unknown>) => Promise<void> }) {
  const filters = [
    { id: 'all', label: 'All' }, { id: 'disagreement', label: 'Disagreement' }, { id: 'no-proof', label: 'No proof' },
    { id: 'inaccessible', label: 'Inaccessible' }, { id: 'platform', label: 'Platform mismatch' }, { id: 'unreviewed', label: 'Unreviewed' },
  ]
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {filters.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)}
            className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors', filter === f.id ? 'bg-solid text-on-solid' : 'border border-line text-graphite hover:text-ink')}>
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-stone">{rows.length} shown</span>
      </div>

      {rows.length === 0 ? (
        <EmptyPanel icon={<CheckCircle2 className="size-5 text-status-success" />} title="No routing rows in this filter" body="Adjust the filter or wait for more decisions." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="min-w-full divide-y divide-line/70 text-left">
            <caption className="sr-only">Routing v1 versus v2 comparison</caption>
            <thead className="bg-bone-raised"><tr><Th>Lead</Th><Th>Current</Th><Th>V1</Th><Th>V2</Th><Th>Eligibility</Th><Th>Proof</Th><Th>Flags</Th><Th>Human judgment</Th></tr></thead>
            <tbody className="divide-y divide-line/70 bg-bone">
              {rows.map((r) => (
                <tr key={r.leadId} className="align-top">
                  <Td><Link href={`/leads/${r.leadId}`} className="font-medium text-ink hover:underline">{r.company}</Link></Td>
                  <Td className="text-graphite">{r.currentSenderName ?? '—'}</Td>
                  <Td className="text-graphite">{r.v1.name ?? '—'}{r.v1.match != null ? ` · ${Math.round(r.v1.match)}` : ''}</Td>
                  <Td className="text-graphite">{r.v2.name ?? '—'}{r.v2.match != null ? ` · ${Math.round(r.v2.match)}` : ''}</Td>
                  <Td>{r.agree ? <PillOk>agree</PillOk> : <PillWarn>disagree</PillWarn>}</Td>
                  <Td>{r.proofUsed ? <PillOk>verified</PillOk> : <PillWarn>none</PillWarn>}</Td>
                  <Td>{r.flags.length === 0 ? <span className="text-[11px] text-stone">—</span> : <ul className="flex flex-wrap gap-1">{r.flags.map((f) => <li key={f} className="rounded-full bg-status-warning/10 px-2 py-0.5 text-[10px] font-medium text-status-warning">{FLAG_LABEL[f] ?? f}</li>)}</ul>}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-[11px] text-stone">
                        V1 <input type="checkbox" aria-label={`V1 correct for ${r.company}`} onChange={(e) => void onSave('routing', { leadId: r.leadId, v1Correct: e.target.checked })} />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-stone">
                        V2 <input type="checkbox" aria-label={`V2 correct for ${r.company}`} onChange={(e) => void onSave('routing', { leadId: r.leadId, v2Correct: e.target.checked })} />
                      </label>
                      <button type="button" className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-graphite hover:text-ink" onClick={() => void onSave('routing', { leadId: r.leadId, bestSenderProfileId: r.v1.senderId })}>
                        Best = V1
                      </button>
                      <button type="button" className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-graphite hover:text-ink" onClick={() => void onSave('routing', { leadId: r.leadId, bestSenderProfileId: r.v2.senderId })}>
                        Best = V2
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Staleness ───────────────────────────────────────────────────────────── */

function StalenessSection({ data }: { data: Staleness | undefined }) {
  if (!data) return <EmptyPanel icon={<AlertTriangle className="size-5 text-status-warning" />} title="Staleness data unavailable" body="The leads table could not be read." />
  const pct = (n: number) => (data.total > 0 ? Math.round((n / data.total) * 100) : 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Current" value={data.current} sub={`${pct(data.current)}%`} tone="success" />
        <Stat label="Older version" value={data.stale} sub={`${pct(data.stale)}%`} tone="warning" />
        <Stat label="Unscored" value={data.unscored} sub={`${pct(data.unscored)}%`} tone="neutral" />
      </div>
      {data.stale === 0 ? (
        <EmptyPanel icon={<CheckCircle2 className="size-5 text-status-success" />} title="No stale scores" body="Every scored lead uses the current intelligence version." />
      ) : (
        <div className="rounded-lg border border-line bg-bone-raised p-4">
          <p className="text-[12px] font-medium text-ink">Version breakdown</p>
          <ul className="mt-2 space-y-1">{Object.entries(data.staleByVersion).map(([v, c]) => <li key={v} className="flex justify-between text-[12px]"><span className="font-mono text-graphite">{v}</span><span className="tabular-nums text-ink">{c}</span></li>)}</ul>
          <p className="mt-3 text-[11px] text-stone">Oldest stale: {data.oldestStaleAt ? new Date(data.oldestStaleAt).toLocaleDateString() : '—'}{data.maxStaleAgeDays != null ? ` · ${data.maxStaleAgeDays}d` : ''}</p>
          <p className="mt-2 text-[11px] text-graphite">Re-analysis is a dry run by default — it never mass-writes.</p>
        </div>
      )}
    </div>
  )
}

/* ── Threads ─────────────────────────────────────────────────────────────── */

function ThreadsSection({ data, onSave }: { data: { threads: ThreadRow[]; unavailable: boolean } | undefined; onSave: (k: string, b: Record<string, unknown>) => Promise<void> }) {
  if (!data) return <EmptyPanel icon={<AlertTriangle className="size-5 text-status-warning" />} title="Thread data unavailable" body="The messages table could not be read." />
  if (data.unavailable) return <EmptyPanel icon={<AlertTriangle className="size-5 text-status-warning" />} title="Thread status unavailable" body="Apply the thread-status migration." />
  if (data.threads.length === 0) return <EmptyPanel icon={<CheckCircle2 className="size-5 text-status-success" />} title="No unverified threads" body="Every inbound message has a verified sender." />
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-graphite">Confirm, reassign or dismiss before treating these as conversation history.</p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="min-w-full divide-y divide-line/70 text-left">
          <caption className="sr-only">Unverified conversation threads</caption>
          <thead className="bg-bone-raised"><tr><Th>Lead</Th><Th>Observed identity</Th><Th>Received</Th><Th>Actions</Th></tr></thead>
          <tbody className="divide-y divide-line/70 bg-bone">
            {data.threads.map((t) => (
              <tr key={t.id} className="align-top">
                <Td><Link href={`/leads/${t.lead_id}`} className="font-medium text-ink hover:underline">{t.lead_id.slice(0, 8)}</Link></Td>
                <Td className="max-w-[300px] truncate text-graphite">{t.sent_text ?? '—'}</Td>
                <Td className="text-graphite">{t.sent_at ? new Date(t.sent_at).toLocaleString() : '—'}</Td>
                <Td>
                  <div className="flex gap-1.5">
                    <button type="button" className="rounded-md bg-solid px-2 py-1 text-[11px] font-medium text-on-solid hover:opacity-90" onClick={() => void onSave('thread', { messageId: t.id, action: 'confirm' })}>Confirm</button>
                    <Link href={`/leads/${t.lead_id}?tab=sender`} className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-graphite hover:text-ink">Reassign</Link>
                    <button type="button" className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-graphite hover:text-ink" onClick={() => void onSave('thread', { messageId: t.id, action: 'dismiss' })}>Dismiss</button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Model comparison ────────────────────────────────────────────────────── */

function ModelComparisonSection({ data }: { data: Record<string, unknown> | undefined }) {
  const gating = (data?.gating as string) ?? 'INSUFFICIENT_DATA'
  const count = (data?.labelCount as number) ?? 0
  const engines = (data?.engines as Array<{ engine: string; accuracy: number | null }> | null) ?? null

  if (gating === 'INSUFFICIENT_DATA') return <EmptyPanel icon={<AlertTriangle className="size-5 text-status-warning" />} title="Insufficient data" body={`${count} human labels. A promotion study needs at least 100.`} />
  if (gating === 'PRELIMINARY_ONLY') {
    return (
      <EmptyPanel icon={<AlertTriangle className="size-5 text-status-warning" />} title="Preliminary only" body={`${count} human labels. Metrics are shown for review, not for promotion. A promotion study needs at least 100.`} />
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-graphite">{count} human labels. Promotion still requires the full review gate — this is a study, not a promotion.</p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="min-w-full divide-y divide-line/70 text-left">
          <caption className="sr-only">Model comparison against human bands</caption>
          <thead className="bg-bone-raised"><tr><Th>Engine</Th><Th>Band accuracy</Th></tr></thead>
          <tbody className="divide-y divide-line/70 bg-bone">
            {(engines ?? []).map((e) => (
              <tr key={e.engine}><Td className="font-mono">{e.engine}</Td><Td className="tabular-nums">{e.accuracy != null ? `${e.accuracy}%` : '—'}</Td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Funnel ──────────────────────────────────────────────────────────────── */

function FunnelSection({ data }: { data: Record<string, number> | undefined }) {
  if (!data) return <EmptyPanel icon={<AlertTriangle className="size-5 text-status-warning" />} title="Funnel data unavailable" body="Outcomes could not be read." />
  const stages: Array<{ label: string; key: string }> = [
    { label: 'Qualified', key: 'qualified' }, { label: 'Conversation', key: 'conversation' },
    { label: 'Meeting', key: 'meeting' }, { label: 'Proposal', key: 'proposal' },
    { label: 'Won', key: 'won' }, { label: 'Lost', key: 'lost' },
  ]
  const max = Math.max(1, ...stages.map((s) => data[s.key] ?? 0))
  return (
    <div className="space-y-2">
      {stages.map((s) => (
        <div key={s.key} className="grid grid-cols-[120px_1fr_40px] items-center gap-3">
          <span className="text-[12px] text-graphite">{s.label}</span>
          <div className="h-6 overflow-hidden rounded bg-bone-raised">
            <div className="h-full rounded bg-solid transition-all" style={{ width: `${Math.round(((data[s.key] ?? 0) / max) * 100)}%` }} />
          </div>
          <span className="text-right text-[12px] tabular-nums text-ink">{data[s.key] ?? 0}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Message review ──────────────────────────────────────────────────────── */

const MESSAGE_SCORES = [
  { value: 5, label: 'Excellent' }, { value: 4, label: 'Good' }, { value: 3, label: 'Acceptable' },
  { value: 2, label: 'Weak' }, { value: 1, label: 'Bad' },
]
const MESSAGE_CLASSES = ['SALES_READY', 'GENERIC', 'MARKETING_NOT_SALES', 'UNSUPPORTED', 'FABRICATED', 'WRONG_STAGE']

function MessageReviewSection({ data, stats, onSave }: { data: { messages: SampleRow[]; unavailable: boolean } | undefined; stats: Record<string, number> | undefined; onSave: (k: string, b: Record<string, unknown>) => Promise<void> }) {
  if (!data) return <EmptyPanel icon={<AlertTriangle className="size-5 text-status-warning" />} title="Message sample unavailable" body="Messages could not be read." />
  const messages = data.messages
  if (messages.length === 0) return <EmptyPanel icon={<CheckCircle2 className="size-5 text-status-success" />} title="No messages to review" body="Generate outreach first." />
  const first = messages[0]!
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="rounded-lg border border-line bg-bone-raised p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-stone">{first.type ?? 'message'} · {first.direction ?? ''}</p>
        <p className="mt-2 whitespace-pre-wrap font-mono text-[13px] text-ink">{first.sent_text ?? '—'}</p>
        <div className="mt-4">
          <p className="text-[12px] font-medium text-ink">Score</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MESSAGE_SCORES.map((s) => (
              <button key={s.value} type="button" className="rounded-md border border-line px-2.5 py-1 text-[12px] text-graphite hover:border-ink/30 hover:text-ink"
                onClick={() => void onSave('message', { messageId: first.id, score: s.value, classification: 'SALES_READY' })}>
                {s.value} · {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-[12px] font-medium text-ink">Classification</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MESSAGE_CLASSES.map((c) => (
              <button key={c} type="button" className="rounded-md border border-line px-2 py-1 text-[11px] text-graphite hover:border-ink/30 hover:text-ink"
                onClick={() => void onSave('message', { messageId: first.id, score: 3, classification: c })}>
                {c.replace(/_/g, ' ').toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-stone">{messages.length - 1} more in the sample.</p>
      </div>
      <MessageStats stats={stats} />
    </div>
  )
}

function MessageStats({ stats }: { stats: Record<string, number> | undefined }) {
  const s = stats ?? {}
  const rows: Array<[string, string]> = [
    ['Reviewed', String(s.total ?? 0)], ['Sales-ready', String(s.salesReady ?? 0)], ['Generic', String(s.generic ?? 0)],
    ['Marketing not sales', String(s.marketingNotSales ?? 0)], ['Unsupported', String(s.unsupported ?? 0)],
    ['Fabricated', String(s.fabricated ?? 0)], ['Wrong stage', String(s.wrongStage ?? 0)],
  ]
  return (
    <div className="rounded-lg border border-line bg-bone-raised p-4">
      <p className="text-[12px] font-medium text-ink">Human message review</p>
      <ul className="mt-2 space-y-1">{rows.map(([k, v]) => <li key={k} className="flex justify-between text-[12px]"><span className="text-graphite">{k}</span><span className="tabular-nums text-ink">{v}</span></li>)}</ul>
      <p className="mt-3 text-[11px] text-stone">Goal: fabricated 0 · unsupported 0 · wrong-stage 0.</p>
    </div>
  )
}

/* ── Thesis review ───────────────────────────────────────────────────────── */

const THESIS_RATINGS = [
  { value: 'STRONG', label: 'Strong' }, { value: 'USEFUL', label: 'Useful' },
  { value: 'WEAK', label: 'Weak' }, { value: 'MISLEADING', label: 'Misleading' },
]

function ThesisReviewSection({ data, stats, onSave }: { data: { theses: SampleRow[]; unavailable: boolean } | undefined; stats: Record<string, number> | undefined; onSave: (k: string, b: Record<string, unknown>) => Promise<void> }) {
  if (!data) return <EmptyPanel icon={<AlertTriangle className="size-5 text-status-warning" />} title="Thesis sample unavailable" body="Leads could not be read." />
  const theses = data.theses
  if (theses.length === 0) return <EmptyPanel icon={<CheckCircle2 className="size-5 text-status-success" />} title="No theses to review" body="Score a lead first." />
  const first = theses[0]!
  const thesis = ((first.canonical_intelligence as Record<string, unknown> | undefined)?.salesThesis ?? null) as Record<string, unknown> | null
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="rounded-lg border border-line bg-bone-raised p-4">
        <p className="text-[13px] font-medium text-ink">{first.contact_name ?? 'Unknown'} · {first.company}</p>
        <p className="text-[11px] text-stone">{first.contact_title ?? ''}</p>
        <dl className="mt-3 space-y-2 text-[12px]">
          <ThesisLine label="Why this account" value={thesis?.whyThisAccount} />
          <ThesisLine label="Likely opportunity" value={thesis?.likelyOpportunity} />
          <ThesisLine label="Why us" value={thesis?.whyUs} />
          <ThesisLine label="Best entry point" value={thesis?.bestEntryPoint} />
          <ThesisLine label="Missing evidence" value={Array.isArray(thesis?.missingEvidence) ? (thesis!.missingEvidence as string[]).join('; ') : null} />
        </dl>
        <div className="mt-4">
          <p className="text-[12px] font-medium text-ink">Rate the thesis</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {THESIS_RATINGS.map((r) => (
              <button key={r.value} type="button" className={cn('rounded-md border px-2.5 py-1 text-[12px]', r.value === 'MISLEADING' ? 'border-status-danger/40 text-status-danger' : 'border-line text-graphite hover:border-ink/30 hover:text-ink')}
                onClick={() => void onSave('thesis', { leadId: first.id, rating: r.value })}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-stone">{theses.length - 1} more in the sample.</p>
      </div>
      <ThesisStats stats={stats} />
    </div>
  )
}

function ThesisLine({ label, value }: { label: string; value?: unknown }) {
  if (!value) return null
  return <div className="flex gap-2"><dt className="w-36 shrink-0 text-stone">{label}</dt><dd className="text-graphite">{String(value)}</dd></div>
}

function ThesisStats({ stats }: { stats: Record<string, number> | undefined }) {
  const s = stats ?? {}
  const rows: Array<[string, string]> = [
    ['Reviewed', String(s.total ?? 0)], ['Strong', String(s.strong ?? 0)], ['Useful', String(s.useful ?? 0)],
    ['Weak', String(s.weak ?? 0)], ['Misleading', String(s.misleading ?? 0)],
  ]
  return (
    <div className="rounded-lg border border-line bg-bone-raised p-4">
      <p className="text-[12px] font-medium text-ink">Human thesis review</p>
      <ul className="mt-2 space-y-1">{rows.map(([k, v]) => <li key={k} className="flex justify-between text-[12px]"><span className="text-graphite">{k}</span><span className="tabular-nums text-ink">{v}</span></li>)}</ul>
      {s.misleadingRate != null && <p className="mt-3 text-[11px] text-stone">Misleading rate: {s.misleadingRate}%.</p>}
    </div>
  )
}

/* ── Primitives ──────────────────────────────────────────────────────────── */

function Th({ children }: { children: React.ReactNode }) {
  return <th scope="col" className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-stone">{children}</th>
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2.5 text-[12px] text-ink', className)}>{children}</td>
}
function PillOk({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-status-success/10 px-2 py-0.5 text-[10px] font-medium text-status-success">{children}</span>
}
function PillWarn({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-status-warning/10 px-2 py-0.5 text-[10px] font-medium text-status-warning">{children}</span>
}
function Stat({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: 'success' | 'warning' | 'neutral' }) {
  return (
    <div className="rounded-lg border border-line bg-bone-raised p-3">
      <p className="text-[11px] text-stone">{label}</p>
      <p className={cn('mt-1 text-[22px] font-medium tabular-nums', tone === 'success' && 'text-status-success', tone === 'warning' && 'text-status-warning', tone === 'neutral' && 'text-ink')}>{value}</p>
      <p className="text-[11px] text-graphite">{sub}</p>
    </div>
  )
}
function EmptyPanel({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-line bg-bone-raised px-4 py-10 text-center">
      {icon}
      <p className="mt-2 text-[13px] font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[12px] text-graphite">{body}</p>
    </div>
  )
}
