/**
 * Before/after diff for a profile's responsibility chain.
 *
 * Pure and framework-free so the review step and the tests reason about the
 * exact same change set. Comparisons are by rep id — display names can be
 * stale, ids cannot.
 */

export interface ChainSeat {
  repId: string
  repName: string
}

export interface ChainSnapshot {
  primaryRepId: string | null
  operators: ChainSeat[]
  backups: ChainSeat[]
}

export interface ChainDraft {
  primary: string
  operatorIds: string[]
  backupIds: string[]
}

export interface ChainDiff {
  primary: { from: string | null; to: string; changed: boolean }
  operators: { added: string[]; removed: string[] }
  backups: { added: string[]; removed: string[]; reordered: boolean }
  changed: boolean
}

const unique = (ids: string[]) => [...new Set(ids)]

export function diffPeopleChain(snapshot: ChainSnapshot, draft: ChainDraft): ChainDiff {
  const operatorAdded = unique(draft.operatorIds).filter((id) => !snapshot.operators.some((s) => s.repId === id))
  const operatorRemoved = snapshot.operators.filter((s) => !draft.operatorIds.includes(s.repId)).map((s) => s.repId)

  const nextBackups = unique(draft.backupIds)
  const backupAdded = nextBackups.filter((id) => !snapshot.backups.some((s) => s.repId === id))
  const backupRemoved = snapshot.backups.filter((s) => !nextBackups.includes(s.repId)).map((s) => s.repId)

  const sameOrder =
    snapshot.backups.length === nextBackups.length &&
    snapshot.backups.every((seat, index) => seat.repId === nextBackups[index])

  const primaryChanged = (snapshot.primaryRepId ?? '') !== draft.primary

  return {
    primary: { from: snapshot.primaryRepId, to: draft.primary, changed: primaryChanged },
    operators: { added: operatorAdded, removed: operatorRemoved },
    backups: { added: backupAdded, removed: backupRemoved, reordered: !sameOrder && backupAdded.length === 0 && backupRemoved.length === 0 },
    changed:
      primaryChanged ||
      operatorAdded.length > 0 ||
      operatorRemoved.length > 0 ||
      backupAdded.length > 0 ||
      backupRemoved.length > 0 ||
      (!sameOrder && backupAdded.length === 0 && backupRemoved.length === 0),
  }
}
