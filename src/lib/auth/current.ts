import type { Organization, Rep, VoiceProfile } from '@/lib/domain/types'
import { isDemoMode } from '@/lib/ai/config'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDemoStore } from '@/lib/store/demo-registry'

export interface CurrentUser {
  rep: Rep
  organization: Organization
  profile: VoiceProfile | null
}

const BPULSE_ORG_ID = '11111111-1111-1111-1111-111111111111'

const DEMO_ORG: Organization = {
  id: BPULSE_ORG_ID,
  name: 'bpulse',
  plan: 'active',
  billingCustomerId: null,
  timezone: 'UTC',
  workingDays: [1, 2, 3, 4, 5],
  holidays: [],
  createdAt: new Date().toISOString(),
}

const DEMO_REP: Rep = {
  id: 'rep-hassan',
  name: 'Hassan (demo)',
  role: 'admin',
  organizationId: BPULSE_ORG_ID,
  createdAt: new Date().toISOString(),
  timezone: 'UTC',
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isDemoMode()) {
    const profile = await getDemoStore(DEMO_REP).getVoiceProfile()
    return { rep: DEMO_REP, organization: DEMO_ORG, profile }
  }

  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null

    const { data: repRows, error: repError } = await supabase
      .from('reps')
      .select('id, name, role, organization_id, created_at, timezone')
      .eq('auth_user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(2)

    if (repError) {
      console.warn('[auth/current] rep lookup failed', {
        userId: user.id,
        email: user.email ?? null,
        code: (repError as { code?: string }).code ?? null,
        message: repError.message,
      })
      return null
    }

    const repRow = repRows?.[0] ?? null

    if (repRows && repRows.length > 1) {
      console.warn('[auth/current] multiple rep rows for auth user; using oldest', {
        userId: user.id,
        repCount: repRows.length,
      })
    }

    if (!repRow) {
      console.warn('[auth/current] no rep mapped to auth user', {
        userId: user.id,
        email: user.email ?? null,
      })
      return null
    }

    const rep: Rep = {
      id: repRow.id,
      name: repRow.name,
      role: repRow.role,
      organizationId: repRow.organization_id,
      createdAt: repRow.created_at,
      timezone: (repRow.timezone as string) ?? 'UTC',
    }

    const { data: orgRows, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, plan, billing_customer_id, timezone, working_days, holidays, created_at')
      .eq('id', rep.organizationId)
      .maybeSingle()

    if (orgError) {
      console.warn('[auth/current] org lookup failed', {
        userId: user.id,
        repId: rep.id,
        organizationId: rep.organizationId,
        code: (orgError as { code?: string }).code ?? null,
        message: orgError.message,
      })
      return null
    }

    if (!orgRows) {
      console.warn('[auth/current] rep mapped to missing org', {
        userId: user.id,
        repId: rep.id,
        organizationId: rep.organizationId,
      })
      return null
    }

    const organization: Organization = {
      id: orgRows.id,
      name: orgRows.name,
      plan: orgRows.plan,
      billingCustomerId: orgRows.billing_customer_id,
      timezone: (orgRows.timezone as string) ?? 'UTC',
      workingDays: Array.isArray(orgRows.working_days) ? (orgRows.working_days as number[]) : [1, 2, 3, 4, 5],
      holidays: Array.isArray(orgRows.holidays) ? (orgRows.holidays as Array<{ date: string; label?: string }>) : [],
      createdAt: orgRows.created_at,
    }

    const { data: vp } = await supabase
      .from('voice_profiles')
      .select('id, rep_id, organization_id, style_card, sample_source, calibrated_at')
      .eq('rep_id', rep.id)
      .maybeSingle()

    const profile: VoiceProfile | null = vp
      ? {
          id: vp.id,
          repId: vp.rep_id,
          organizationId: vp.organization_id,
          styleCard: vp.style_card,
          sampleSource: vp.sample_source,
          calibratedAt: vp.calibrated_at,
        }
      : null

    return { rep, organization, profile }
  } catch (error) {
    console.warn('[auth/current] unexpected auth resolution error', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}
