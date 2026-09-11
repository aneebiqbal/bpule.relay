import type { Rep, VoiceProfile } from '@/lib/domain/types'
import { isDemoMode } from '@/lib/ai/config'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDemoStore } from '@/lib/store/demo-registry'

export interface CurrentUser {
  rep: Rep
  profile: VoiceProfile | null
}

const DEMO_REP: Rep = {
  id: 'rep-hassan',
  name: 'Hassan (demo)',
  role: 'admin',
  createdAt: new Date().toISOString(),
}

/**
 * Resolves the signed-in rep. In demo mode there is a fixed demo admin; in
 * Supabase mode the rep is looked up from the session cookie's auth user.
 * Returns null when there is no valid session.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isDemoMode()) {
    const profile = await getDemoStore(DEMO_REP).getVoiceProfile()
    return { rep: DEMO_REP, profile }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: repRows } = await supabase
    .from('reps')
    .select('id, name, role, created_at')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!repRows) return null

  const rep: Rep = {
    id: repRows.id,
    name: repRows.name,
    role: repRows.role,
    createdAt: repRows.created_at,
  }

  const { data: vp } = await supabase
    .from('voice_profiles')
    .select('id, rep_id, style_card, sample_source, calibrated_at')
    .eq('rep_id', rep.id)
    .maybeSingle()

  const profile: VoiceProfile | null = vp
    ? {
        id: vp.id,
        repId: vp.rep_id,
        styleCard: vp.style_card,
        sampleSource: vp.sample_source,
        calibratedAt: vp.calibrated_at,
      }
    : null

  return { rep, profile }
}