import { cache } from 'react'
import type { Organization, Rep, VoiceProfile } from '@/lib/domain/types'
import { isDemoMode } from '@/lib/ai/config'
import { getAuthProvider } from '@/lib/auth/provider'
import { getDbClient } from '@/lib/db/provider'
import { getDemoStore } from '@/lib/store/demo-registry'

export interface CurrentUser {
  rep: Rep
  organization: Organization
  profile: VoiceProfile | null
  /**
   * The authenticated user's id. Under Supabase this is the auth.users id; on
   * the Neon provider it is the Neon Auth user id. The database adapter puts it
   * in `app.current_user_id` so RLS can derive organization and role — the
   * browser never supplies an organization id.
   */
  authUserId: string
}

const BPULSE_ORG_ID = '11111111-1111-1111-1111-111111111111'

const PERF_LOG = process.env.SCOUT_PERF_LOG === '1'

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

type EmbeddedOrgRow = {
  id: string
  name: string
  plan: string
  billing_customer_id: string | null
  timezone: string | null
  working_days: number[] | null
  holidays: Array<{ date: string; label?: string }> | null
  created_at: string
}

type EmbeddedVoiceProfileRow = {
  id: string
  rep_id: string
  organization_id: string
  style_card: VoiceProfile['styleCard']
  sample_source: VoiceProfile['sampleSource']
  calibrated_at: string | null
}

function firstEmbedded<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/**
 * Resolves the signed-in rep, organization and voice profile for the current
 * request. Wrapped in React `cache` so the layout, page and store all share a
 * single auth + profile lookup per request instead of re-querying Supabase.
 */
async function resolveCurrentUser(): Promise<CurrentUser | null> {
  if (isDemoMode()) {
    const profile = await getDemoStore(DEMO_REP).getVoiceProfile()
    return { rep: DEMO_REP, organization: DEMO_ORG, profile, authUserId: DEMO_REP.id }
  }

  const startedAt = PERF_LOG ? performance.now() : 0

  try {
    const authStartedAt = PERF_LOG ? performance.now() : 0
    // The provider resolves the session for the active backend; the user id is
    // the only thing the database lookup needs.
    const auth = await getAuthProvider()
    const { user } = await auth.getSession()
    const userId = user?.id ?? null
    const userEmail = user?.email ?? null
    if (PERF_LOG) {
      console.log(
        `[perf] getCurrentUser.auth ${(performance.now() - authStartedAt).toFixed(1)}ms`,
      )
    }

    if (!userId) return null

    // Two plain reads instead of a PostgREST embed (`organizations (...)`),
    // which the Neon adapter does not translate. Batched by id, so this stays
    // two round trips regardless of team size.
    // The Neon adapter needs the identity in scope so RLS can derive the
    // organization; the Supabase adapter takes it from the request cookies.
    const db = await getDbClient(userId)
    const { data: repRows, error: repError } = await db
      .from('reps')
      .select('id, name, role, organization_id, created_at, timezone')
      .eq('auth_user_id', userId)
      .order('created_at', { ascending: true })
      .limit(2)

    if (repError) {
      console.warn('[auth/current] rep lookup failed', {
        userId,
        email: userEmail,
        message: repError.message,
      })
      return null
    }

    const repRow = repRows?.[0] ?? null

    if (repRows && repRows.length > 1) {
      console.warn('[auth/current] multiple rep rows for auth user; using oldest', {
        userId,
        repCount: repRows.length,
      })
    }

    if (!repRow) {
      console.warn('[auth/current] no rep mapped to auth user', {
        userId,
        email: userEmail,
      })
      return null
    }

    const [orgResult, profileResult] = await Promise.all([
      db
        .from('organizations')
        .select('id, name, plan, billing_customer_id, timezone, working_days, holidays, created_at')
        .eq('id', repRow.organization_id)
        .maybeSingle(),
      db
        .from('voice_profiles')
        .select('id, rep_id, organization_id, style_card, sample_source, calibrated_at')
        .eq('rep_id', repRow.id)
        .maybeSingle(),
    ])

    const orgRow = orgResult.data as EmbeddedOrgRow | null

    if (!orgRow) {
      console.warn('[auth/current] rep mapped to missing org', {
        userId,
        repId: repRow.id,
        organizationId: repRow.organization_id,
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

    const organization: Organization = {
      id: orgRow.id,
      name: orgRow.name,
      plan: orgRow.plan as Organization['plan'],
      billingCustomerId: orgRow.billing_customer_id,
      timezone: (orgRow.timezone as string) ?? 'UTC',
      workingDays: Array.isArray(orgRow.working_days) ? (orgRow.working_days as number[]) : [1, 2, 3, 4, 5],
      holidays: Array.isArray(orgRow.holidays) ? (orgRow.holidays as Array<{ date: string; label?: string }>) : [],
      createdAt: orgRow.created_at,
    }

    const vp = profileResult.data as EmbeddedVoiceProfileRow | null

    const profile: VoiceProfile | null = vp
      ? {
          id: vp.id,
          repId: vp.rep_id,
          organizationId: vp.organization_id,
          styleCard: vp.style_card,
          sampleSource: vp.sample_source,
          calibratedAt: vp.calibrated_at as string,
        }
      : null

    if (PERF_LOG) {
      console.log(
        `[perf] getCurrentUser.total ${(performance.now() - startedAt).toFixed(1)}ms t=${Date.now()}`,
        { role: rep.role },
      )
    }

    return { rep, organization, profile, authUserId: userId }
  } catch (error) {
    console.warn('[auth/current] unexpected auth resolution error', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}

export const getCurrentUser = cache(resolveCurrentUser)
