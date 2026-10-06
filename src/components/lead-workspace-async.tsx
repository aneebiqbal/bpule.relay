'use client'

import { use } from 'react'
import { LeadWorkspaceSimple } from './lead-workspace-simple'
import type { LeadDetail } from '@/lib/store/types'
import type { Profile } from '@/lib/domain/types'

interface LeadData {
  lead: LeadDetail
  profiles: Profile[]
}

export function LeadWorkspaceAsync({ dataPromise }: { dataPromise: Promise<LeadData> }) {
  const { lead, profiles } = use(dataPromise)
  return <LeadWorkspaceSimple lead={lead} profiles={profiles} />
}
