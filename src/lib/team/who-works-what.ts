import type { CoveragePlan, CoverageProfileResult } from '@/lib/coverage/engine'
import type { RevenueIdentityChannel } from '@/lib/domain/types'

/**
 * "Who works what" — the one compact operating answer.
 *
 * Derived only from the canonical coverage plan: permanent ownership plus
 * active temporary cover. Backups are eligibility-only and never appear here,
 * and a temporary cover is labelled with the primary it covers for.
 */

export interface WhoWorksWhatChannel {
  channel: RevenueIdentityChannel
  role: 'PRIMARY' | 'TEMPORARY'
  coveringFor: string | null
}

export interface WhoWorksWhatPerson {
  profileId: string
  name: string
  channels: WhoWorksWhatChannel[]
  /** Operator whose shift is open now — the time-aware responsibility truth. */
  workingNow: Array<{ repId: string; repName: string | null }>
  /** The next shift to open today, when the profile is not fully covered. */
  nextShift: { repId: string; repName: string | null } | null
  /** Uncovered minutes in the business day — the 24-hour coverage gate. */
  coverageGapMinutes: number
}

export interface WhoWorksWhatRep {
  repId: string
  repName: string
  people: WhoWorksWhatPerson[]
}

function addChannel(
  byRep: Map<string, Map<string, WhoWorksWhatPerson>>,
  repId: string,
  profile: CoverageProfileResult,
  entry: WhoWorksWhatChannel,
) {
  let byPerson = byRep.get(repId)
  if (!byPerson) {
    byPerson = new Map()
    byRep.set(repId, byPerson)
  }
  let person = byPerson.get(profile.profileId)
  if (!person) {
    person = {
      profileId: profile.profileId,
      name: profile.name,
      channels: [],
      workingNow: [],
      nextShift: null,
      coverageGapMinutes: 0,
    }
    byPerson.set(profile.profileId, person)
  }
  person.workingNow = (profile.currentOperators ?? []).map((row) => ({
    repId: row.repId,
    repName: row.repName ?? null,
  }))
  person.nextShift = profile.nextOperator
    ? { repId: profile.nextOperator.repId, repName: profile.nextOperator.repName ?? null }
    : null
  person.coverageGapMinutes = (profile.coverageGaps ?? []).reduce((sum, gap) => sum + gap.minutes, 0)
  // A person can be both primary and covering on different channels; keep the
  // execution role (temporary) when it exists.
  const existing = person.channels.find((row) => row.channel === entry.channel)
  if (!existing) {
    person.channels.push(entry)
  } else if (entry.role === 'TEMPORARY' && existing.role === 'PRIMARY') {
    person.channels[person.channels.indexOf(existing)] = entry
  }
}

export function buildWhoWorksWhat(plan: CoveragePlan): WhoWorksWhatRep[] {
  const byRep = new Map<string, Map<string, WhoWorksWhatPerson>>()
  const repNames = new Map<string, string>()

  for (const profile of plan.profiles) {
    const channels = profile.channels.length > 0 ? profile.channels : (['other'] as RevenueIdentityChannel[])
    if (profile.primaryRepId) {
      repNames.set(profile.primaryRepId, profile.primaryRepName ?? 'Unknown')
      for (const channel of channels) {
        addChannel(byRep, profile.primaryRepId, profile, { channel, role: 'PRIMARY', coveringFor: null })
      }
    }
    if (profile.activeCoveringRepId && profile.activeCoveringRepId !== profile.primaryRepId) {
      repNames.set(profile.activeCoveringRepId, profile.activeCoveringRepName ?? 'Unknown')
      for (const channel of channels) {
        addChannel(byRep, profile.activeCoveringRepId, profile, {
          channel,
          role: 'TEMPORARY',
          coveringFor: profile.primaryRepName ?? null,
        })
      }
    }
  }

  return [...byRep.entries()]
    .map(([repId, people]) => ({
      repId,
      repName: repNames.get(repId) ?? 'Unknown',
      people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.repName.localeCompare(b.repName))
}
