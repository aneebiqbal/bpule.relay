'use client'

import { use } from 'react'
import { LeadWorkspace } from './lead-workspace'
import type { LeadDetail } from '@/lib/store/types'
import type { Profile, ProofItem, ScoreResult, RevenueIdentityWithAssignment } from '@/lib/domain/types'

interface LeadData {
  lead: LeadDetail
  score: ScoreResult
  profiles: Profile[]
  matchedProofs: ProofItem[]
  assignedIdentities: RevenueIdentityWithAssignment[]
}

export function LeadWorkspaceAsync({ dataPromise }: { dataPromise: Promise<LeadData> }) {
  const props = use(dataPromise)
  return <LeadWorkspace {...props} />
}
