import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loginAsAdmin } from './helpers'

/**
 * AUTH_INVITED_USER_END_TO_END — the invite-only onboarding lifecycle.
 *
 * Invite-only is the product contract: `POST /api/admin/invitations` is the only
 * way a new account is created, and the auth callback turns the trusted
 * `app_metadata` invitation into a rep + organisation role exactly once.
 *
 * No controlled mailbox exists in this environment, so the invite link is
 * generated through the Supabase admin API (`generateLink`) instead of being read
 * out of an inbox. That link is byte-for-byte the link the email carries, so the
 * entire application flow — consent, callback, provisioning, onboarding — is
 * exercised. The email-delivery hop itself is NOT verified here and is recorded
 * as such in the artifact rather than claimed as PASS.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = (process.env.E2E_BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
const ARTIFACT = path.join(process.cwd(), 'qa-artifacts', 'auth-onboarding.json')

function service() {
  return createClient(SUPABASE_URL as string, SERVICE_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function writeArtifact(result: 'PASS' | 'FAIL' | 'NOT_RUN', reason: string) {
  mkdirSync(path.dirname(ARTIFACT), { recursive: true })
  writeFileSync(ARTIFACT, JSON.stringify({ result, reason, at: new Date().toISOString() }))
}

test.describe('AUTH_INVITED_USER_END_TO_END', () => {
  test('invite → callback → onboarding provisions exactly once', async ({ page, request }) => {
    test.setTimeout(240_000)
    if (!SUPABASE_URL || !SERVICE_KEY) {
      writeArtifact('NOT_RUN', 'Supabase credentials are not configured')
      test.skip('Supabase credentials are not configured')
      return
    }

    const email = `qa-invite-${Date.now()}@example.com`
    const admin = service()

    // Clean slate: a leftover user from an interrupted run must not make the
    // invite collide. Only the exact email this run uses is removed.
    try {
      const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const prior = existing.users.find((u) => u.email === email)
      if (prior) await admin.auth.admin.deleteUser(prior.id)
    } catch { /* best effort */ }

    // 1. The owner sends the invite — the only account-creation path.
    await loginAsAdmin(page)
    const inviteRes = await request.post('/api/admin/invitations', {
      data: { email, role: 'MEMBER' },
    })
    expect(inviteRes.ok(), `invite failed: ${inviteRes.status()} ${await inviteRes.text().catch(() => '')}`).toBe(true)
    const invited = (await inviteRes.json()) as { userId?: string; code?: string }
    expect(invited.userId, 'the invite did not return a user id').toBeTruthy()
    const authUserId = invited.userId as string

    // The invitation must live in admin-only app_metadata, not in the app.
    const { data: userRow } = await admin.auth.admin.getUserById(authUserId)
    expect((userRow.user?.app_metadata as Record<string, unknown>)?.relay_invitation, 'the invitation was not written to app_metadata').toBeTruthy()

    // 2. The invite link (admin-generated; no inbox in this environment).
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${BASE}/auth/callback?next=/onboarding` },
    })
    expect(linkErr, `generateLink failed: ${linkErr?.message ?? ''}`).toBeNull()
    const actionLink = (linkData?.properties as { action_link?: string } | undefined)?.action_link
    expect(actionLink, 'no invite action link was returned').toBeTruthy()

    // 3. Open the link: Supabase confirms and hands the app a code, the callback
    //    exchanges it and provisions the invited member.
    await page.goto(actionLink as string, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 })

    // 4. Exactly one auth user, one rep, one membership, one role.
    const { data: repRows, error: repErr } = await admin
      .from('reps')
      .select('id, organization_id, auth_user_id, role')
      .eq('auth_user_id', authUserId)
    expect(repErr, `rep lookup failed: ${repErr?.message ?? ''}`).toBeNull()
    expect(repRows, 'the invited user has no rep row').toHaveLength(1)
    const repId = repRows![0].id as string

    const { data: roleRows, error: roleErr } = await admin
      .from('organization_roles')
      .select('role')
      .eq('person_id', repId)
    expect(roleErr, `role lookup failed: ${roleErr?.message ?? ''}`).toBeNull()
    expect(roleRows, 'the invited user has no organisation role').toHaveLength(1)
    expect(roleRows![0].role).toBe('MEMBER')

    // 5. The provisioning is idempotent: a second pass adds no duplicates.
    const { provisionInvitedMember } = await import('@/lib/auth/invitations-server')
    const { readInvitation } = await import('@/lib/auth/invitations')
    const invitation = readInvitation(userRow.user?.app_metadata)
    expect(invitation, 'the invitation could not be read back').toBeTruthy()
    await provisionInvitedMember({
      invitation: invitation!,
      authUserId,
      email,
      displayName: null,
    })

    const { data: repAfter } = await admin.from('reps').select('id').eq('auth_user_id', authUserId)
    const { data: roleAfter } = await admin.from('organization_roles').select('role').eq('person_id', repId)
    expect(repAfter).toHaveLength(1)
    expect(roleAfter).toHaveLength(1)

    // 6. Cleanup — only the rows this run created.
    await admin.from('organization_roles').delete().eq('person_id', repId)
    await admin.from('reps').delete().eq('id', repId)
    await admin.auth.admin.deleteUser(authUserId)

    // The email-delivery hop is not exercised: the link was generated, not read.
    writeArtifact('PASS', 'invite → callback → onboarding provisioned exactly once; email delivery not exercised (admin-generated link)')
  })
})
