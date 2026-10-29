import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Target, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonText, SkeletonCircle } from '@/components/ui/skeleton'
import { LeadsBoardV2 } from '@/components/leads/leads-board-v2'
import type { LeadRow } from '@/components/leads/pipeline-utils'
import { loadBoardData } from '@/lib/leads/board-rows'

export const dynamic = 'force-dynamic'

type LeadsPayload = { leads: LeadRow[]; workspaceName: string | null; orgView: boolean }

async function loadLeads(): Promise<LeadsPayload> {
  const { leads, workspace, orgView } = await loadBoardData()
  return { leads, workspaceName: workspace?.identityName ?? null, orgView }
}

export default function LeadsPage() {
  const leadsPromise = loadLeads()

  return (
    <div className="space-y-5">
      <Suspense fallback={<LeadsPageFallback />}>
        <LeadsHeader leadsPromise={leadsPromise} />
      </Suspense>

      <Suspense fallback={<LeadsBodySkeleton />}>
        <LeadsBody leadsPromise={leadsPromise} />
      </Suspense>
    </div>
  )
}

async function LeadsHeader({ leadsPromise }: { leadsPromise: Promise<LeadsPayload> }) {
  const { workspaceName, orgView, leads } = await leadsPromise
  return (
    <PageHeader
      title="Leads Pipeline"
      description={orgView
        ? `All ${leads.length} active leads in the organisation — every rep and every identity. Archived leads are not counted.`
        : workspaceName
          ? `${leads.length} active ${leads.length === 1 ? 'lead' : 'leads'} captured under ${workspaceName}. Switch workspace to change the set.`
          : `${leads.length} active ${leads.length === 1 ? 'lead' : 'leads'} you own. Archived leads are not counted.`}
      action={
        <Link
          href="/leads/new"
          className="inline-flex items-center gap-2 rounded-md bg-orange px-3 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-orange-dark"
        >
          <Plus className="size-4" aria-hidden="true" />
          New lead
        </Link>
      }
    />
  )
}

async function LeadsBody({ leadsPromise }: { leadsPromise: Promise<LeadsPayload> }) {
  const { leads, workspaceName } = await leadsPromise

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title={workspaceName ? `No leads captured under ${workspaceName}` : 'No leads yet'}
        description={workspaceName
          ? `Nothing was captured while ${workspaceName} was selected. Switch workspace to see your other identities, or check a new prospect.`
          : 'Paste a LinkedIn profile, add a company, or import from Upwork. Relay scores them and tells you who is worth contacting.'}
        action={
          <Link
            href="/prospect"
            className="inline-flex items-center gap-2 rounded-md bg-orange px-3 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-orange-dark"
          >
            <Search className="size-4" aria-hidden="true" />
            Check a prospect
          </Link>
        }
      />
    )
  }

  return <LeadsBoardV2 leads={leads} />
}

function LeadsPageFallback() {
  return (
    <div className="space-y-2">
      <SkeletonText className="h-7 w-48" />
      <SkeletonText className="h-3 w-80" />
    </div>
  )
}

function LeadsBodySkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-8 w-full rounded-md bg-bone-raised" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[280px] shrink-0 rounded-xl border border-line bg-bone">
            <div className="border-b border-line/40 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <SkeletonCircle className="size-2" />
                <SkeletonText className="h-3 w-20" />
              </div>
            </div>
            <div className="space-y-2 p-2">
              {Array.from({ length: 2 }).map((__, j) => (
                <div key={j} className="rounded-lg border border-line/60 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <SkeletonCircle className="size-8" />
                    <SkeletonText className="h-3 w-24" />
                  </div>
                  <SkeletonText className="h-2.5 w-full" />
                  <SkeletonText className="h-2.5 w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
