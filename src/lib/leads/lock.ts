// Connection-pacing lock shared by the store, queue engine, and UI.

export const CONNECTION_LOCK_MS = 6 * 60 * 60 * 1000 // 6 hours

export function isLeadLocked(lockedUntil: string | null, now: number = Date.now()): boolean {
  if (!lockedUntil) return false
  return new Date(lockedUntil).getTime() > now
}

export function lockCountdownMs(lockedUntil: string | null, now: number = Date.now()): number {
  if (!lockedUntil) return 0
  const remaining = new Date(lockedUntil).getTime() - now
  return remaining > 0 ? remaining : 0
}
