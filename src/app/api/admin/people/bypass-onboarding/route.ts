import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { createServerSupabase } from '@/lib/supabase/server'
import { DEFAULT_QUIZ } from '@/lib/style/quiz'
import { calibrateStyleCard } from '@/lib/style/calibrate'

export async function POST(request: Request) {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  let body: { repId?: string; all?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const supabase = await createServerSupabase()

  try {
    if (body.all) {
      const { data: reps } = await supabase
        .from('reps')
        .select('id')
        .eq('organization_id', authCtx.orgId)

      const repIds = (reps ?? []).map((r) => r.id)
      let created = 0
      let skipped = 0

      for (const repId of repIds) {
        const existing = await supabase
          .from('voice_profiles')
          .select('id')
          .eq('rep_id', repId)
          .limit(1)

        if (existing.data && existing.data.length > 0) {
          skipped++
          continue
        }

        const result = await calibrateStyleCard({ quiz: DEFAULT_QUIZ, samples: '' })
        await supabase.from('voice_profiles').upsert(
          {
            rep_id: repId,
            organization_id: authCtx.orgId,
            style_card: JSON.parse(JSON.stringify(result.card)),
            sample_source: 'autobypass',
            calibrated_at: new Date().toISOString(),
          },
          { onConflict: 'rep_id' },
        )
        created++
      }

      return NextResponse.json({ ok: true, created, skipped, total: repIds.length })
    }

    if (!body.repId) {
      return NextResponse.json({ error: 'repId or all=true required.' }, { status: 400 })
    }

    const existing = await supabase
      .from('voice_profiles')
      .select('id')
      .eq('rep_id', body.repId)
      .limit(1)

    if (existing.data && existing.data.length > 0) {
      return NextResponse.json({ ok: true, created: 0, skipped: 1, alreadyOnboarded: true })
    }

    const result = await calibrateStyleCard({ quiz: DEFAULT_QUIZ, samples: '' })
    await supabase.from('voice_profiles').upsert(
      {
        rep_id: body.repId,
        organization_id: authCtx.orgId,
        style_card: JSON.parse(JSON.stringify(result.card)),
        sample_source: 'autobypass',
        calibrated_at: new Date().toISOString(),
      },
      { onConflict: 'rep_id' },
    )

    return NextResponse.json({ ok: true, created: 1, skipped: 0 })
  } catch (err) {
    return safeErrorResponse(err, 500, 'Failed to bypass onboarding.', 'admin/people/bypass-onboarding')
  }
}
