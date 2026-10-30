export interface EmailSendResult {
  accepted: boolean
  provider: string
  providerMessageId: string | null
  providerThreadId: string | null
  status: 'QUEUED' | 'SENT' | 'FAILED'
  failureReason: string | null
}

export interface EmailProvider {
  id: string
  name: string
  send(input: {
    fromEmail: string
    fromName: string
    toEmail: string
    subject: string
    body: string
    replyTo?: string | null
    metadata?: Record<string, unknown>
  }): Promise<EmailSendResult>
  getDeliveryStatus(input: {
    providerMessageId: string
  }): Promise<{ status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'BOUNCED' | 'FAILED' | 'UNKNOWN'; raw: Record<string, unknown> }>
  getThread(input: {
    providerThreadId: string
  }): Promise<{ threadId: string; messageIds: string[] }>
  getMessages(input: {
    providerThreadId: string
  }): Promise<Array<{ providerMessageId: string; direction: 'OUTBOUND' | 'INBOUND'; subject: string | null; body: string | null; sentAt: string | null }>>
}

function stableId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}

export const relayNoopEmailProvider: EmailProvider = {
  id: 'relay_noop',
  name: 'Relay Noop Provider',
  async send() {
    return {
      accepted: true,
      provider: 'relay_noop',
      providerMessageId: stableId('msg'),
      providerThreadId: stableId('thread'),
      status: 'SENT',
      failureReason: null,
    }
  },
  async getDeliveryStatus() {
    return {
      status: 'SENT',
      raw: { provider: 'relay_noop' },
    }
  },
  async getThread(input) {
    return {
      threadId: input.providerThreadId,
      messageIds: [],
    }
  },
  async getMessages() {
    return []
  },
}

/**
 * The provider registry.
 *
 * `getEmailProvider` used to ignore its argument and return the no-op provider
 * unconditionally, which meant a deployment could never be sure it was sending
 * through a real mailbox. The id is now authoritative: an unknown provider and a
 * no-op provider outside an explicit test override both fail closed.
 */
const registry = new Map<string, EmailProvider>()

export function registerEmailProvider(provider: EmailProvider): void {
  registry.set(provider.id, provider)
}

export function listEmailProviderIds(): string[] {
  return [...registry.keys()]
}

export class EmailProviderUnavailableError extends Error {
  readonly provider: string | null

  constructor(reason: string, provider: string | null = null) {
    super(reason)
    this.name = 'EmailProviderUnavailableError'
    this.provider = provider
  }
}

/**
 * The no-op provider is a test fixture, not a capability. It is refused unless
 * `RELAY_ALLOW_NOOP_EMAIL_PROVIDER=true` is set explicitly.
 */
function noopProviderAllowed(): boolean {
  return process.env.RELAY_ALLOW_NOOP_EMAIL_PROVIDER === 'true'
}

export function getEmailProvider(providerId?: string | null): EmailProvider {
  const id = providerId?.trim()

  if (!id) {
    throw new EmailProviderUnavailableError('no_email_provider_configured')
  }
  if (id === relayNoopEmailProvider.id) {
    if (!noopProviderAllowed()) {
      throw new EmailProviderUnavailableError('noop_email_provider_not_available', id)
    }
    return relayNoopEmailProvider
  }

  const provider = registry.get(id)
  if (!provider) {
    throw new EmailProviderUnavailableError(`unknown_email_provider:${id}`, id)
  }
  return provider
}

registerEmailProvider(relayNoopEmailProvider)
