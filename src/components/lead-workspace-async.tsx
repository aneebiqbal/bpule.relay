'use client'

import { use } from 'react'
import { LeadWorkspace } from './lead-workspace'
import type { LeadDetail } from '@/lib/store/types'
import type { Profile, ProofItem, ScoreResult } from '@/lib/domain/types'

interface LeadData {
  lead: LeadDetail
  score: ScoreResult
  profiles: Profile[]
  matchedProofs: ProofItem[]
}

export function LeadWorkspaceAsync({ dataPromise }: { dataPromise: Promise<LeadData> }) {
  const props = use(dataPromise)
  return <LeadWorkspace {...props} />
}
