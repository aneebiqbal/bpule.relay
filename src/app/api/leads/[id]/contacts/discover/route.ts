import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getContactDiscoveryProvider } from '@/lib/email/providers/contact-discovery-provider'
import { inferPatternEmail, isValidEmail } from '@/lib/email/contact-points'
import { safeErrorResponse } from '@/lib/errors'

function domainFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: {
    fullName?: string | null
    company?: string | null
    domain?: string | null
    linkedinUrl?: string | null
    website?: string | null
  }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  try {
    const store = await createScoutStore()
    const lead = await store.getLead(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })

    const provider = getContactDiscoveryProvider()
    const fullName = body.fullName ?? lead.contactName
    const company = body.company ?? lead.company
    const domain = body.domain ?? domainFromUrl(body.website ?? lead.url)

    const [person, companyInfo, discovered] = await Promise.all([
      provider.findPerson({
        fullName,
        linkedinUrl: body.linkedinUrl ?? lead.url,
        website: body.website ?? lead.url,
        company,
        role: lead.contactTitle,
      }),
      provider.findCompany({
        company,
        website: body.website ?? lead.url,
        domain,
      }),
      provider.findEmails({
        fullName,
        company,
        domain,
        linkedinUrl: body.linkedinUrl ?? lead.url,
        website: body.website ?? lead.url,
      }),
    ])

    const suggestions = [...discovered]
    const inferred = inferPatternEmail(fullName ?? null, companyInfo?.domain ?? domain ?? null)
    if (inferred && isValidEmail(inferred) && !suggestions.some((s) => s.email.toLowerCase() === inferred.toLowerCase())) {
      suggestions.push({
        email: inferred,
        source: 'INFERRED_PATTERN',
        sourceUrl: companyInfo?.website ?? body.website ?? lead.url,
        confidence: 0.35,
        verificationStatus: 'UNVERIFIED',
      })
    }

    return NextResponse.json({
      provider: provider.id,
      available: provider.id !== 'none',
      person,
      company: companyInfo,
      suggestions,
    })
  } catch (error) {
    if (error instanceof Error && /not the owner/i.test(error.message)) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    }
    return safeErrorResponse(error, 500, 'Failed to discover contact route.', 'leads/[id]/contacts/discover')
  }
}
