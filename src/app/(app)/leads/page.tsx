import { getCurrentUser } from '@/lib/auth/current'
import { hasActiveLeadFilters, loadFilteredBoard, loadLeadsPage } from '@/lib/leads/leads-page'
import { loadBoardPreview } from '@/lib/leads/board-rows'
import { isPipelineView, parseLeadsQuery } from '@/components/leads/pipeline-utils'
import { LeadsTable } from '@/components/leads/leads-table'
import { LeadsViewToggle } from '@/components/leads/leads-view-toggle'
import { LeadsBoardV2 } from '@/components/leads/leads-board-v2'
import { SalesHeader } from '@/components/sales/sales-header'

export const dynamic = 'force-dynamic'

/**
 * Leads is the primary CRM workspace. Table is the default dense record view;
 * Pipeline is the same leads grouped by their canonical stage — a representation
 * toggle, never a second data model.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = parseLeadsQuery(params)

  if (isPipelineView(query.view)) {
    // A filtered pipeline must honour the same canonical filter contract as the
    // table, so it reads the filtered set server-side instead of the aggregate
    // fast path (which cannot express these filters).
    let board: Awaited<ReturnType<typeof loadBoardPreview>>
    try {
      board = hasActiveLeadFilters(query)
        ? await loadFilteredBoard(query)
        : await loadBoardPreview()
    } catch (err) {
      return (
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
          <SalesHeader
            title="Pipeline"
            description="The same leads grouped by their canonical stage."
            meta={<LeadsViewToggle view="pipeline" query={query} />}
          />
          <p role="alert" className="mt-4 rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger">
            {err instanceof Error ? err.message : 'The pipeline could not be loaded.'}
          </p>
        </div>
      )
    }

    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
        <SalesHeader
          title="Pipeline"
          count={board.total}
          countLabel="leads"
          description={
            board.orgView
              ? 'Every active lead in the organisation, grouped by its canonical stage.'
              : 'Every active lead for the selected profile, grouped by its canonical stage.'
          }
          meta={<LeadsViewToggle view="pipeline" query={query} />}
        />
        <div className="mt-5">
          <LeadsBoardV2 leads={board.cards} counts={board.counts} total={board.total} />
        </div>
      </div>
    )
  }

  let data: Awaited<ReturnType<typeof loadLeadsPage>>
  let currentRepId: string | null = null
  try {
    const [loaded, user] = await Promise.all([loadLeadsPage(query), getCurrentUser()])
    data = loaded
    currentRepId = user?.rep?.id ?? null
  } catch (err) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
        <SalesHeader
          title="Leads"
          description="Every active opportunity for the selected profile."
          meta={<LeadsViewToggle view="table" query={query} />}
        />
        <p role="alert" className="mt-4 rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger">
          {err instanceof Error ? err.message : 'Leads could not be loaded.'}
        </p>
      </div>
    )
  }

  const now = Date.now()

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <LeadsTable
        leads={data.leads}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        pageCount={data.pageCount}
        orgView={data.orgView || data.teamView}
        workspaceName={data.workspace?.identityName ?? null}
        currentRepId={currentRepId}
        reps={data.reps}
        profiles={data.profiles}
        query={query}
        now={now}
        viewToggle={<LeadsViewToggle view="table" query={query} />}
      />
    </div>
  )
}
