import type { Play, SignalId } from '@/lib/domain/types'
import { signalById } from '@/lib/score/signals'

/**
 * Matches a play template to a lead by its signal situation. Falls back to
 * the first play when nothing matches. Single source for play assignment so
 * drafting and the Team screen can never disagree about which play a lead
 * belongs to.
 */
export function pickPlayForSignal(
  plays: Play[],
  signalType: SignalId | null,
): Play | null {
  if (plays.length === 0) return null
  const signal = signalById(signalType)
  const match = signal
    ? plays.find(
        (p) =>
          p.situation.toLowerCase().includes(signal.name) ||
          signal.name.includes(p.situation.toLowerCase()),
      )
    : undefined
  return match ?? plays[0] ?? null
}