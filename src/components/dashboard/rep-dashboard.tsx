'use client'

import type { RepWorkspaceData } from '@/components/rep/rep-workspace'
import { RepHomeView } from '@/components/rep/rep-home-view'

/** Rep Home — daily execution workspace (Sprint 1 / Phase 3). */
export function RepDashboard({ data }: { data: RepWorkspaceData }) {
  return <RepHomeView data={data} />
}
