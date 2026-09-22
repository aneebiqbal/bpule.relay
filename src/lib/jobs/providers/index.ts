/**
 * Find Jobs — provider registry.
 *
 * Sources a job search across all configured providers. Display order groups
 * the reliable remote boards first, then credential-backed boards.
 */

import type { JobProvider } from '../provider-types'
import { adzuna } from './adzuna'
import { himalayas } from './himalayas'
import { remoteok } from './remoteok'
import { jobicy } from './jobicy'
import { remotive } from './remotive'
import { arbeitnow } from './arbeitnow'
import { themuse } from './themuse'
import { usajobs } from './usajobs'

export const allProviders: JobProvider[] = [
  himalayas,
  remoteok,
  jobicy,
  remotive,
  arbeitnow,
  adzuna,
  themuse,
  usajobs,
]

const bySource = new Map(allProviders.map((p) => [p.meta.id, p]))

export function providerFor(source: string): JobProvider | undefined {
  return bySource.get(source as JobProvider['meta']['id'])
}

export { adzuna, himalayas, remoteok, jobicy, remotive, arbeitnow, themuse, usajobs }