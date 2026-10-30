/**
 * Provider registration.
 *
 * Importing this module registers every provider the deployment supports. It has
 * to be imported once, from the mail path, so that a provider is never missing
 * merely because a route forgot to import it.
 *
 * Registration is unconditional — whether a provider can actually be *used*
 * depends on configuration, which `getEmailProvider` reports by failing closed.
 */
import { registerEmailProviderFactory } from './email-provider'
import { createGmailProvider, isGmailCredentials } from './gmail'

registerEmailProviderFactory('gmail', (credentials) => {
  if (!isGmailCredentials(credentials)) {
    throw new Error('gmail provider requires accessToken and refreshToken credentials.')
  }
  return createGmailProvider(credentials)
})

export { createGmailProvider, isGmailCredentials } from './gmail'
