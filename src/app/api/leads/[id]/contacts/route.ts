import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { addLeadContactPoint, listLeadContactPoints } from '@/lib/email/service'
import { getContactDiscoveryProvider } from '@/lib/email/providers/contact-discovery-provider'
import { safeErrorResponse } from '@/lib/errors'

export const dynamic = 'force-dynamic'

function domainFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`
    return new URL(normalized).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const store = await createScoutStore()
    const lead = await store.getLead(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })

    const client = await createServerSupabase()
    const contacts = await listLeadContactPoints(client, store.organizationId, id)
    return NextResponse.json({ contacts })
  } catch (error) {
    if (error instanceof Error && /not the owner/i.test(error.message)) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    }
    return safeErrorResponse(error, 500, 'Failed to load contact points.', 'leads/[id]/contacts')
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: {
    type?: string
    value?: string
    source?: string
    sourceUrl?: string | null
    sourceType?: string | null
    verificationStatus?: 'VERIFIED' | 'LIKELY_VALID' | 'UNVERIFIED' | 'INVALID' | 'BOUNCED' | 'UNKNOWN'
    verificationMethod?: string | null
    confidence?: number | null
    isPrimary?: boolean
    isBusinessContact?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const type = body.type === 'email' || body.type === 'linkedin' || body.type === 'contact_form' || body.type === 'phone' || body.type === 'other'
    ? body.type
    : null
  if (!type) return NextResponse.json({ error: 'Invalid contact point type.' }, { status: 400 })

  const value = body.value?.trim() ?? ''
  if (!value) return NextResponse.json({ error: 'Contact value is required.' }, { status: 400 })

  const source = body.source === 'USER_PROVIDED' || body.source === 'PUBLIC_PROFILE' || body.source === 'COMPANY_WEBSITE' || body.source === 'PUBLIC_DIRECTORY' || body.source === 'CONNECTED_PROVIDER' || body.source === 'INBOUND' || body.source === 'INFERRED_PATTERN'
    ? body.source
    : 'USER_PROVIDED'

  try {
    const store = await createScoutStore()
    const lead = await store.getLead(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })

    let verificationStatus = body.verificationStatus ?? 'UNKNOWN'
    let verificationMethod = body.verificationMethod ?? null
    let confidence = body.confidence ?? null

    if (type === 'email' && verificationStatus === 'UNKNOWN') {
      const provider = getContactDiscoveryProvider()
      const verified = await provider.verifyEmail({
        email: value,
        companyDomain: domainFromUrl(lead.url),
      }).catch(() => null)
      if (verified) {
        verificationStatus = verified.status
        verificationMethod = verified.method
        confidence = verified.confidence
      }
    }

    const client = await createServerSupabase()
    const contact = await addLeadContactPoint({
      client,
      orgId: store.organizationId,
      leadId: id,
      type,
      value,
      source,
      sourceUrl: body.sourceUrl ?? null,
      sourceType: body.sourceType ?? null,
      verificationStatus,
      verificationMethod,
      confidence,
      isPrimary: Boolean(body.isPrimary),
      isBusinessContact: body.isBusinessContact,
    })

    return NextResponse.json({ contact }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && /not the owner/i.test(error.message)) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    }
    return safeErrorResponse(error, 500, 'Failed to save contact point.', 'leads/[id]/contacts')
  }
}
