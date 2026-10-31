import { loadProspectsPage } from '@/lib/prospect/prospects-page'
import {
  ProspectsWorkspace,
  isProspectsTab,
  type ProspectsTab,
} from '@/components/prospect/prospects-workspace'
import { PageHeader } from '@/components/ui/page-header'

export const dynamic = 'force-dynamic'

/**
 * Prospects is a workspace, not a single-use form: Analyze the source, then see
 * every check you have run, the leads they became and the watchlist.
 */
export default async function ProspectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab
  const tab: ProspectsTab = isProspectsTab(rawTab) ? rawTab : 'analyze'

  let data: Awaited<ReturnType<typeof loadProspectsPage>>
  try {
    data = await loadProspectsPage()
  } catch (err) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
        <PageHeader eyebrow="Sales" title="Prospects" description="Every check, saved lead and watchlist entry." />
        <p role="alert" className="mt-4 rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger">
          {err instanceof Error ? err.message : 'Prospects could not be loaded.'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <ProspectsWorkspace
        tab={tab}
        recent={data.recent}
        saved={data.saved}
        watchlist={data.watchlist}
        workspaceName={data.workspace?.identityName ?? null}
        orgView={data.orgView}
        profiles={data.profiles}
        now={Date.now()}
      />
    </div>
  )
}
