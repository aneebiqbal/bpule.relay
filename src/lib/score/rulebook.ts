import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  OrganizationRulebook,
  SignalDefinition,
  SignalId,
  VerdictThresholds,
} from '@/lib/domain/types'

/**
 * Loads an organization's scoring rulebook from the database.
 * The rulebook defines the signal types, their weights, and the verdict
 * thresholds — all configurable per organization rather than hardcoded.
 */
export async function loadRulebook(
  client: SupabaseClient,
  organizationId: string,
): Promise<OrganizationRulebook | null> {
  const { data, error } = await client
    .from('organization_rulebooks')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !data) return null

  return {
    organizationId: data.organization_id,
    signals: data.signals as SignalDefinition[],
    verdictThresholds: data.verdict_thresholds as VerdictThresholds,
    maxSignalWeight: data.max_signal_weight,
    maxCompleteness: data.max_completeness,
    confidenceSendThreshold: data.confidence_send_threshold,
  }
}

export function signalById(
  signals: SignalDefinition[],
  id: number | null,
): SignalDefinition | null {
  if (id === null) return null
  return signals.find((s) => s.id === id) ?? null
}
