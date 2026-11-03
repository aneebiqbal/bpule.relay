import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { V3EmptyState, V3PageHeader } from '@/components/v3/primitives'
import { InlineEmpty, LinkTabs } from '@/components/operations/ops-primitives'
import { OpsFilters } from '@/components/operations/ops-filters'
import { opsHref } from '@/lib/operations/filters'
import {
  filterIdeaRows,
  ideaStatus,
  ideaTopics,
  ideaViewMatches,
  rowToContentIdea,
  type IdeaStatusFilter,
} from '@/lib/content/ideas-v3'

export const dynamic = 'force-dynamic'

const VIEWS = [
  { value: 'today', label: 'Today' },
  { value: 'recent', label: 'Recent' },
  { value: 'all', label: 'All' },
] as const

/**
 * Content → Ideas. Browse, filter and reuse the canonical daily ideas. Views
 * and filters are URL state; there is one route.
 */
export default async function ContentIdeasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const raw = (key: string): string | null => {
    const value = sp[key]
    const first = Array.isArray(value) ? value[0] : value
    return first?.trim() || null
  }
  const view = VIEWS.some((v) => v.value === raw('view')) ? (raw('view') as 'today' | 'recent' | 'all') : 'recent'
  const topic = raw('topic') ?? 'ALL'
  const source = raw('source') === 'trend' || raw('source') === 'editorial' ? raw('source') : 'ALL'
  const status: IdeaStatusFilter = ['recommended', 'alternate', 'used', 'posted', 'all'].includes(raw('status') ?? '')
    ? (raw('status') as IdeaStatusFilter)
    : 'all'
  const store = await createScoutStore()
  const personas = await store.listContentPersonas(user.rep.id)

  if (personas.length === 0) {
    return (
      <div className="space-y-6">
        <V3PageHeader title="Ideas" subtitle="Browse and reuse your content ideas." />
        <V3EmptyState title="No content persona yet" body="Create a persona to start generating ideas.">
          <Link href="/content/new" className="relay-cta text-[12px]">Create persona</Link>
        </V3EmptyState>
      </div>
    )
  }

  const selectedPersona = personas.find((p) => p.id === raw('persona')) ?? personas[0]
  const personaName = new Map(personas.map((p) => [p.id, p.displayName]))
  const client = store.getSupabaseClient()
  let rows: Record<string, unknown>[] = []
  let error = false
  try {
    const res = await client
      .from('daily_content_ideas')
      .select('*')
      .eq('persona_id', selectedPersona.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (res.error) throw res.error
    rows = (res.data ?? []) as Record<string, unknown>[]
  } catch (err) {
    console.error('content ideas failed:', err)
    error = true
  }

  const all = rows.map((row) => rowToContentIdea(row, personaName.get(selectedPersona.id) ?? 'Persona'))
  const topics = ideaTopics(all)
  const filtered = filterIdeaRows(all, {
    personaId: selectedPersona.id,
    topic,
    source: source as 'trend' | 'editorial' | 'ALL',
    status,
  }).filter((idea) => ideaViewMatches(idea, view, Date.now()))

  const current = { view: raw('view'), persona: raw('persona'), topic: raw('topic'), source: raw('source'), status: raw('status') }

  return (
    <div className="space-y-5">
      <V3PageHeader title="Ideas" subtitle="Browse, filter and reuse ideas across your content." />

      <LinkTabs
        label="Idea views"
        active={view}
        tabs={VIEWS.map((v) => ({ value: v.value, label: v.label, href: opsHref('/content/ideas', current, { view: v.value }) }))}
      />

      <OpsFilters
        basePath="/content/ideas"
        current={current}
        filters={[
          ...(personas.length > 1
            ? [{ key: 'persona', label: 'Persona', allLabel: 'All personas', options: personas.map((p) => ({ value: p.id, label: p.displayName })) }]
            : []),
          { key: 'topic', label: 'Topic', allLabel: 'All topics', options: topics.map((t) => ({ value: t, label: t })) },
          { key: 'source', label: 'Source', allLabel: 'All sources', options: [{ value: 'trend', label: 'Trend-led' }, { value: 'editorial', label: 'Editorial' }] },
          {
            key: 'status',
            label: 'Status',
            allLabel: 'Any status',
            options: [
              { value: 'recommended', label: 'Recommended' },
              { value: 'alternate', label: 'Alternate' },
              { value: 'used', label: 'Used' },
              { value: 'posted', label: 'Posted' },
            ],
          },
        ]}
      />

      {error ? (
        <p role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger">
          Ideas could not be loaded. Refresh to try again.
        </p>
      ) : filtered.length === 0 ? (
        <InlineEmpty>No ideas match this view. Generate a brief in Studio to create new ideas.</InlineEmpty>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
            <table className="w-full text-left text-[13px]">
              <caption className="sr-only">Content ideas</caption>
              <thead className="bg-bone-raised text-[11px] uppercase tracking-[0.06em] text-stone">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Idea</th>
                  <th scope="col" className="px-3 py-2 font-medium">Topic</th>
                  <th scope="col" className="px-3 py-2 font-medium">Source</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((idea) => {
                  const status = ideaStatus(idea)
                  return (
                    <tr key={idea.id} className="border-t border-line/70 align-top">
                      <td className="max-w-[420px] px-3 py-2.5">
                        <p className="font-medium text-ink">{idea.title}</p>
                        {idea.angle && <p className="mt-0.5 line-clamp-2 text-[12px] text-graphite">{idea.angle}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-graphite">{idea.territory ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={idea.trendGrounded ? 'text-cobalt' : 'text-stone'}>
                          {idea.trendGrounded ? 'Trend' : 'Editorial'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={
                            status === 'posted'
                              ? 'text-status-success'
                              : status === 'used'
                                ? 'text-cobalt'
                                : status === 'recommended'
                                  ? 'text-orange'
                                  : 'text-graphite'
                          }
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link
                          href={`/studio/drafts/new?personaId=${idea.personaId}&ideaId=${idea.id}`}
                          className="text-[12px] font-medium text-cobalt hover:underline"
                        >
                          Draft
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 md:hidden">
            {filtered.map((idea) => (
              <li key={idea.id} className="rounded-lg border border-line bg-bone-raised px-3 py-3">
                <p className="text-[13px] font-medium text-ink">{idea.title}</p>
                {idea.angle && <p className="mt-0.5 line-clamp-2 text-[12px] text-graphite">{idea.angle}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-stone">
                    {idea.territory ?? 'Editorial'} · {ideaStatus(idea)}
                  </span>
                  <Link href={`/studio/drafts/new?personaId=${idea.personaId}&ideaId=${idea.id}`} className="text-[12px] font-medium text-cobalt">
                    Draft
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
