import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Analytics tracking endpoint.
 *
 * Receives UX behavior events. Currently logs to console for internal review.
 * Can be extended to write to database or external analytics service.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // In production, write to analytics store
    // For now, log internally (can be disabled in prod via env flag)
    if (process.env.NODE_ENV === 'development') {
      console.log('[analytics]', body.event, body.leadId ?? '', body.durationMs ? `${body.durationMs}ms` : '')
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
