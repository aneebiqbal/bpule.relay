import type { SignalId } from '@/lib/domain/types'

export interface SignalDefinition {
  id: SignalId
  name: string
  weight: number
  short: string
  description: string
  example: string
}

export const SIGNALS: SignalDefinition[] = [
  {
    id: 1,
    name: 'hiring',
    weight: 6,
    short: 'Hiring ramp',
    description:
      'Recent job posts, especially engineering or operations roles, suggesting the team cannot keep up with shipping.',
    example: 'Three open engineering roles listed in the last month.',
  },
  {
    id: 2,
    name: 'understaffed',
    weight: 5,
    short: 'Tiny team',
    description:
      'A solo founder or a very small team visibly maintaining the whole product.',
    example: 'The app page credits a single developer for the last two releases.',
  },
  {
    id: 3,
    name: 'funding',
    weight: 4,
    short: 'Raised money',
    description:
      'A recent funding round, which usually means budget to spend on delivery.',
    example: 'Announced a seed round of $2M in the press release.',
  },
  {
    id: 4,
    name: 'stale',
    weight: 4,
    short: 'Stale product',
    description:
      'No meaningful updates for months, an outdated store listing, or broken visible features.',
    example: 'Last app update was more than a year ago and reviews call it out.',
  },
  {
    id: 5,
    name: 'weak_stack',
    weight: 3,
    short: 'Aging stack',
    description:
      'Dated or weak technology mentions, like old frameworks, no mobile presence, or legacy integrations.',
    example: 'Runs an unsupported framework version with no mobile app.',
  },
  {
    id: 6,
    name: 'pain',
    weight: 5,
    short: 'Recorded pain',
    description:
      'Complaints about release speed, missed deadlines, cost, or quality that point at delivery capacity.',
    example: 'A review or post describing a six-month wait for a simple fix.',
  },
  {
    id: 7,
    name: 'asking',
    weight: 7,
    short: 'Asking for help',
    description:
      'A founder or lead publicly asking for help, praising an agency, or otherwise signaling they are open to partners.',
    example: 'Posted looking for a dev shop to take over the mobile app.',
  },
]

export function signalById(id: SignalId | null): SignalDefinition | null {
  if (id === null) return null
  return SIGNALS.find((s) => s.id === id) ?? null
}

export const VERDICT_RULES = {
  send: { min: 10, max: 12 },
  research_more: { min: 7, max: 9 },
  skip: { min: 0, max: 6 },
} as const