import { redirect } from 'next/navigation'
import { getCurrentUser, type CurrentUser } from '@/lib/auth/current'
import { getAuthContext, type AuthContext } from '@/lib/auth/organization'

export function isProductAdmin(user: CurrentUser | null | undefined, authCtx: AuthContext | null | undefined): boolean {
  if (!user) return false
  // Auth context is the canonical source. Never trust reps.role alone — it may
  // be stale after a demotion that updated organization_roles but not reps.
  return Boolean(authCtx?.isOwner || authCtx?.isAdmin)
}

export async function requireProductAdmin(): Promise<{ user: CurrentUser; authCtx: AuthContext | null }> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const authCtx = await getAuthContext()
  if (!isProductAdmin(user, authCtx)) redirect('/dashboard')
  return { user, authCtx }
}
