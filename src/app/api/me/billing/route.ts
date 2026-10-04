/**
 * GET /api/me/billing
 *
 * Returns the current organization's plan. Used by the billing success page
 * to poll for premium activation after Stripe Checkout redirects back. The
 * webhook may arrive after the redirect, so the page polls this endpoint.
 *
 * Returns { plan } — the organization's current plan from the DB.
 */
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    return NextResponse.json({ plan: user.organization.plan })
  } catch {
    return NextResponse.json({ error: 'Failed to resolve billing status' }, { status: 500 })
  }
}
