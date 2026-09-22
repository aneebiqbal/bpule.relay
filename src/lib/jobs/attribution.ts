/**
 * Find Jobs — provider attribution.
 *
 * Every job must be traceable to its source, and where a provider's terms
 * require a link-back or a label, that metadata lives here so it is enforced
 * consistently across cards, detail panels and API responses.
 */

import type { Attribution, JobSource } from './types'

export interface ProviderAttributionMeta {
  id: JobSource
  name: string
  attribution: Attribution
}

export const PROVIDER_ATTRIBUTION: Record<JobSource, ProviderAttributionMeta> = {
  adzuna: {
    id: 'adzuna',
    name: 'Adzuna',
    attribution: {
      required: true,
      label: 'Adzuna',
      url: 'https://www.adzuna.com',
    },
  },
  himalayas: {
    id: 'himalayas',
    name: 'Himalayas',
    attribution: {
      required: true,
      label: 'Himalayas',
      url: 'https://himalayas.app',
    },
  },
  remoteok: {
    id: 'remoteok',
    name: 'RemoteOK',
    attribution: {
      required: true,
      label: 'RemoteOK',
      url: 'https://remoteok.com',
    },
  },
  jobicy: {
    id: 'jobicy',
    name: 'Jobicy',
    attribution: {
      required: true,
      label: 'Jobicy',
      url: 'https://jobicy.com',
    },
  },
  remotive: {
    id: 'remotive',
    name: 'Remotive',
    attribution: {
      required: true,
      label: 'Remotive',
      url: 'https://remotive.com',
    },
  },
  arbeitnow: {
    id: 'arbeitnow',
    name: 'Arbeitnow',
    attribution: {
      required: true,
      label: 'Arbeitnow',
      url: 'https://www.arbeitnow.com',
    },
  },
  themuse: {
    id: 'themuse',
    name: 'The Muse',
    attribution: {
      required: true,
      label: 'The Muse',
      url: 'https://www.themuse.com',
    },
  },
  usajobs: {
    id: 'usajobs',
    name: 'USAJOBS',
    attribution: {
      required: true,
      label: 'USAJOBS',
      url: 'https://www.usajobs.gov',
    },
  },
}

export function providerName(source: JobSource): string {
  return PROVIDER_ATTRIBUTION[source]?.name ?? source
}

export function providerAttribution(source: JobSource): Attribution {
  return PROVIDER_ATTRIBUTION[source]?.attribution ?? { required: true, label: source }
}