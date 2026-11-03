'use client'

import type { RepWorkspaceData } from '@/components/rep/rep-workspace'
import type { RepRole } from '@/lib/domain/types'
import { RepHomeView } from '@/components/rep/rep-home-view'

/** Rep Home — daily execution workspace (Relay V3 Sprint 1). */
export function RepDashboard({ data, role }: { data: RepWorkspaceData; role: RepRole }) {
  return <RepHomeView data={data} role={role} />
}
