import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { noopProvider, extractDomain } from '@/lib/bd/email-engine'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { leadId?: string; name?: string; company?: string; domain?: string; linkedinUrl?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { name, company, domain, linkedinUrl } = body
  if (!name && !body.leadId) {
    return NextResponse.json({ error: 'Provide name or leadId.' }, { status: 400 })
  }

  const prospectDomain = domain || extractDomain(company ?? null)
  const provider = noopProvider

  const result = await provider.findPersonEmail({
    name: name ?? '',
    company: company ?? null,
    domain: prospectDomain,
    linkedinUrl: linkedinUrl ?? null,
  })

  return NextResponse.json({
    email: result.email,
    confidence: result.confidence,
    provider: result.provider,
    verificationStatus: result.verificationStatus,
    available: provider.id !== 'none',
  })
}
