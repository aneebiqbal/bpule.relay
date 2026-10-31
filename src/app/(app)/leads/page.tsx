import { getCurrentUser } from '@/lib/auth/current'
import { loadLeadsPage } from '@/lib/leads/leads-page'
import { loadBoardData } from '@/lib/leads/board-rows'
import { parseLeadsQuery } from '@/components/leads/pipeline-utils'
import { LeadsTable } from '@/components/leads/leads-table'
import { LeadsViewToggle, isPipelineView } from '@/components/leads/leads-view-toggle'
import { LeadsBoardV2 } from '@/components/leads/leads-board-v2'
import { PageHeader } from '@/components/ui/page-header'

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
    let board: Awaited<ReturnType<typeof loadBoardData>>
    try {
      board = await loadBoardData()
    } catch (err) {
      return (
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
          <PageHeader
            eyebrow="Sales"
            title="Pipeline"
            description="The same leads grouped by their canonical stage."
            savedView={<LeadsViewToggle view="pipeline" query={query} />}
          />
          <p role="alert" className="mt-4 rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger">
            {err instanceof Error ? err.message : 'The pipeline could not be loaded.'}
          </p>
        </div>
      )
    }

    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
        <PageHeader
          eyebrow="Sales"
          title="Pipeline"
          description={
            board.orgView
              ? 'Every active lead in the organisation, grouped by its canonical stage.'
              : 'Every active lead for the selected profile, grouped by its canonical stage.'
          }
          savedView={<LeadsViewToggle view="pipeline" query={query} />}
        />
        <div className="mt-5">
          <LeadsBoardV2 leads={board.leads} />
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
        <PageHeader
          eyebrow="Sales"
          title="Leads"
          description="Every active opportunity for the selected profile."
          savedView={<LeadsViewToggle view="table" query={query} />}
        />
        <p role="alert" className="mt-4 rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger">
          {err instanceof Error ? err.message : 'Leads could not be loaded.'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <LeadsTable
        leads={data.leads}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        pageCount={data.pageCount}
        orgView={data.orgView}
        workspaceName={data.workspace?.identityName ?? null}
        currentRepId={currentRepId}
        reps={data.reps}
        query={query}
        now={Date.now()}
        viewToggle={<LeadsViewToggle view="table" query={query} />}
      />
    </div>
  )
}
