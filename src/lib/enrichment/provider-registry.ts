/**
 * Provider registry — the only way an adapter is built.
 *
 * Apollo is deliberately absent: with no credentials and no verified endpoint it
 * is a NON-DEPENDENCY (§2). Requesting it fails loudly instead of silently
 * calling something unproven.
 */
import type { DbClient } from '@/lib/db/types'
import type { ProviderAdapter, ProviderName } from './providers/types'
import { ProviderError } from './providers/provider-http'
import { ProspeoAdapter, type ProspeoContext } from './providers/prospeo'
import { SnovAdapter, type SnovContext } from './providers/snov'
import type { TelemetrySink } from './providers/provider-http'

export interface ProviderContext {
  organizationId: string
  searchRunId?: string | null
  telemetry?: TelemetrySink
  client?: DbClient
}

export function providerApiKey(name: ProviderName): string | null {
  switch (name) {
    case 'prospeo':
      return process.env.PROSPEO_API_KEY ?? null
    case 'snov':
      return process.env.SNOV_CLIENT_ID && process.env.SNOV_CLIENT_SECRET
        ? `${process.env.SNOV_CLIENT_ID}:${process.env.SNOV_CLIENT_SECRET}`
        : null
    default:
      return null
  }
}

export function getProviderAdapter(name: ProviderName, context: ProviderContext): ProviderAdapter {
  if (name === 'apollo') {
    throw new ProviderError('ERROR', 'apollo is disabled by design; it is a non-dependency')
  }

  const key = providerApiKey(name)
  if (!key) {
    throw new ProviderError('INVALID_KEY', `${name} is not configured on the server`)
  }

  if (name === 'prospeo') {
    return new ProspeoAdapter({
      apiKey: key,
      organizationId: context.organizationId,
      searchRunId: context.searchRunId,
      telemetry: context.telemetry,
    })
  }

  const [clientId, clientSecret] = key.split(':')
  return new SnovAdapter({
    clientId: clientId ?? '',
    clientSecret: clientSecret ?? '',
    organizationId: context.organizationId,
    searchRunId: context.searchRunId,
    telemetry: context.telemetry,
  })
}

/** True when the org could actually call this provider right now. */
export function providerConfigured(name: ProviderName): boolean {
  return providerApiKey(name) !== null
}
