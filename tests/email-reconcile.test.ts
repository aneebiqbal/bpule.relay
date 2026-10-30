/**
 * §34 — the provider accepted the send but Relay's local write failed.
 *
 * A naive retry sends a second copy of an email already in the recipient's
 * inbox. Reconciliation must rebuild the record from the provider's own message
 * identity and must be safe to run twice.
 */
import { describe, expect, it } from 'vitest'
import { reconcileAcceptedSend } from '@/lib/email/reconcile'

const ORG = '11111111-1111-1111-1111-111111111111'
const PROVIDER = 'gmail'
const PROVIDER_MESSAGE_ID = 'gmail-msg-1'

interface Tables {
  email_messages: Array<Record<string, unknown>>
  email_send_attempts: Array<Record<string, unknown>>
  prepared_email_drafts: Array<Record<string, unknown>>
}

function fakeClient(tables: Tables, options: { failFirstInsert?: boolean } = {}) {
  const client = {
    from(table: string) {
      const rows = () => tables[table as keyof Tables]

      const chain: Record<string, unknown> = {
        eq: () => chain,
        maybeSingle: () => {
          const found = rows().length > 0 ? rows()[0] : null
          return Promise.resolve({ data: found, error: null })
        },
        single: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        select: () => chain,
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }

      chain.insert = (payload: Record<string, unknown>) => {
        if (options.failFirstInsert) {
          options.failFirstInsert = false
          const failed: Record<string, unknown> = {}
          failed.select = () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } }),
          })
          return failed
        }
        rows().push({ id: `row-${rows().length + 1}`, ...payload })
        const inserted = rows()[rows().length - 1]
        const ok: Record<string, unknown> = {}
        ok.select = () => ({ maybeSingle: () => Promise.resolve({ data: inserted, error: null }) })
        return ok
      }

      return chain
    },
  }
  return client
}

const DRAFT = {
  id: 'draft-1',
  lead_id: 'lead-1',
  revenue_identity_id: 'identity-1',
  contact_point_id: 'cp-1',
  contact_email: 'buyer@acme.com',
  subject: 'Re: your platform',
  body: 'Hi Sara,',
  is_followup: false,
}

function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'attempt-1',
    lead_id: 'lead-1',
    prepared_draft_id: 'draft-1',
    revenue_identity_id: 'identity-1',
    idempotency_key: 'email:lead-1:draft-1',
    status: 'FAILED',
    email_message_id: null,
    failure_reason: 'persist_failed_after_provider_accept',
    provider_message_id: PROVIDER_MESSAGE_ID,
    ...overrides,
  }
}

describe('reconcileAcceptedSend', () => {
  it('rebuilds the message row from the provider message identity', async () => {
    const tables: Tables = {
      email_messages: [],
      email_send_attempts: [attemptRow()],
      prepared_email_drafts: [DRAFT],
    }

    const result = await reconcileAcceptedSend(fakeClient(tables) as never, {
      organizationId: ORG,
      provider: PROVIDER,
      providerMessageId: PROVIDER_MESSAGE_ID,
    })

    expect(result.reconciled).toBe(true)
    expect(result.reason).toBe('recorded')
    expect(tables.email_messages).toHaveLength(1)
    expect(tables.email_messages[0]).toMatchObject({
      organization_id: ORG,
      lead_id: 'lead-1',
      provider: PROVIDER,
      provider_message_id: PROVIDER_MESSAGE_ID,
      delivery_status: 'SENT',
      idempotency_key: 'email:lead-1:draft-1',
    })
  })

  it('is idempotent: a second run does not create a second row', async () => {
    const tables: Tables = {
      email_messages: [],
      email_send_attempts: [attemptRow()],
      prepared_email_drafts: [DRAFT],
    }
    const client = fakeClient(tables)

    await reconcileAcceptedSend(client as never, { organizationId: ORG, provider: PROVIDER, providerMessageId: PROVIDER_MESSAGE_ID })
    const second = await reconcileAcceptedSend(client as never, {
      organizationId: ORG,
      provider: PROVIDER,
      providerMessageId: PROVIDER_MESSAGE_ID,
    })

    expect(second.reason).toBe('already_recorded')
    expect(second.reconciled).toBe(false)
    expect(tables.email_messages).toHaveLength(1)
  })

  it('survives a concurrent reconciliation racing on the unique key', async () => {
    // The other worker won the race: its row is already there when ours fails.
    const tables: Tables = {
      email_messages: [
        {
          id: 'row-raced',
          organization_id: ORG,
          lead_id: 'lead-1',
          idempotency_key: 'email:lead-1:draft-1',
          provider: PROVIDER,
          provider_message_id: PROVIDER_MESSAGE_ID,
          delivery_status: 'SENT',
        },
      ],
      email_send_attempts: [attemptRow()],
      prepared_email_drafts: [DRAFT],
    }

    const result = await reconcileAcceptedSend(fakeClient(tables, { failFirstInsert: true }) as never, {
      organizationId: ORG,
      provider: PROVIDER,
      providerMessageId: PROVIDER_MESSAGE_ID,
    })

    expect(result.reason).toBe('already_recorded')
    expect(tables.email_messages).toHaveLength(1)
  })

  it('does nothing when the provider message id is unknown to Relay', async () => {
    const tables: Tables = {
      email_messages: [],
      email_send_attempts: [],
      prepared_email_drafts: [DRAFT],
    }

    const result = await reconcileAcceptedSend(fakeClient(tables) as never, {
      organizationId: ORG,
      provider: PROVIDER,
      providerMessageId: 'never-accepted',
    })

    expect(result.reason).toBe('no_accepted_send')
    expect(result.emailMessage).toBeNull()
    expect(tables.email_messages).toHaveLength(0)
  })

  it('does nothing when the draft the send came from is gone', async () => {
    const tables: Tables = {
      email_messages: [],
      email_send_attempts: [attemptRow()],
      prepared_email_drafts: [],
    }

    const result = await reconcileAcceptedSend(fakeClient(tables) as never, {
      organizationId: ORG,
      provider: PROVIDER,
      providerMessageId: PROVIDER_MESSAGE_ID,
    })

    expect(result.reason).toBe('missing_draft')
    expect(tables.email_messages).toHaveLength(0)
  })
})
