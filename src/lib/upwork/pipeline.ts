import type { UpworkJobStatus } from '@/lib/domain/types'

/** The canonical lifecycle, in order. One state per job. */
export interface UpworkStage {
  key: UpworkJobStatus
  label: string
  detail: string
}

export const UPWORK_OPEN_STAGES: UpworkStage[] = [
  { key: 'SAVED', label: 'Saved', detail: 'On your list. Not reviewed yet.' },
  { key: 'DRAFT_READY', label: 'Draft ready', detail: 'Proposal written. Not submitted.' },
  { key: 'APPLIED', label: 'Applied', detail: 'Application submitted. Connects are spent.' },
  { key: 'CLIENT_REPLIED', label: 'Client replied', detail: 'The client wrote back.' },
  { key: 'INTERVIEW', label: 'Interview', detail: 'Talking with the client.' },
  { key: 'WON', label: 'Won', detail: 'Awarded. Preserve the history.' },
  { key: 'LOST', label: 'Lost', detail: 'Closed without a win.' },
]

export const UPWORK_ARCHIVED_STAGE: UpworkStage = {
  key: 'ARCHIVED',
  label: 'Archived',
  detail: 'Out of the active queue. History preserved.',
}

export const UPWORK_ALL_STAGES: UpworkStage[] = [...UPWORK_OPEN_STAGES, UPWORK_ARCHIVED_STAGE]

export function upworkStageLabel(status: UpworkJobStatus): string {
  return UPWORK_ALL_STAGES.find((stage) => stage.key === status)?.label ?? status
}

export function upworkStageDetail(status: UpworkJobStatus): string {
  return UPWORK_ALL_STAGES.find((stage) => stage.key === status)?.detail ?? 'Unknown stage.'
}

/** True when the job is out of the active queue. */
export function isArchivedStatus(status: UpworkJobStatus): boolean {
  return status === 'ARCHIVED'
}
