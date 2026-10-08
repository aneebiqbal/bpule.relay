'use client'

import { use } from 'react'
import { LeadWorkspaceSimple } from './lead-workspace-simple'
import type { LeadDetail } from '@/lib/store/types'
import type { Profile } from '@/lib/domain/types'

interface LeadData {
  lead: LeadDetail
  profiles: Profile[]
  dailyLimit: number
  todaySends: number
}

export function LeadWorkspaceAsync({ dataPromise }: { dataPromise: Promise<LeadData> }) {
  const { lead, profiles, dailyLimit, todaySends } = use(dataPromise)
  return <LeadWorkspaceSimple lead={lead} profiles={profiles} dailyLimit={dailyLimit} todaySends={todaySends} />
}
