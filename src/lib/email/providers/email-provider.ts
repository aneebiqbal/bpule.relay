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

export function getEmailProvider(_providerId?: string | null): EmailProvider {
  return relayNoopEmailProvider
}
