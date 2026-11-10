/**
 * The one compatibility boundary between the legacy lowercase Upwork statuses
 * (still present in production during the cutover) and the canonical lifecycle.
 *
 * Reads normalize legacy → canonical here and nowhere else. Writes are canonical
 * only, so the dual-state handling never spreads into components or routes.
 */
import type { UpworkJobStatus } from '@/lib/domain/types'
import { isUpworkJobStatus, mapLegacyStatus } from '@/lib/upwork/lifecycle'

export function normalizeJobStatus(status: string | null | undefined): UpworkJobStatus {
  if (!status) return 'SAVED'
  if (isUpworkJobStatus(status)) return status
  return mapLegacyStatus(status)
}
