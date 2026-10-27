/**
 * BUG-008 / BUG-009 — auth capability contract.
 *
 * "UI cannot advertise an authentication capability the deployment cannot
 * execute." The UI renders from `getAuthCapabilities`, so a Google button or a
 * Create Workspace form only appears when the deployment can honour it.
 */

import { describe, expect, it } from 'vitest'
import { getAuthCapabilities, signupAvailable } from '@/lib/auth/capabilities'

const BASE = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
}

describe('BUG-008 signup capability', () => {
  it('is invite-only when an invite code is configured', () => {
    const caps = getAuthCapabilities({ ...BASE, SIGNUP_INVITE_CODE: 'relay-2026' })
    expect(caps.inviteOnlySignupEnabled).toBe(true)
    expect(caps.publicSignupEnabled).toBe(false)
    expect(signupAvailable(caps)).toBe(true)
  })

  it('is public only when explicitly turned on', () => {
    const caps = getAuthCapabilities({ ...BASE, SIGNUP_PUBLIC: 'true', SIGNUP_INVITE_CODE: 'relay-2026' })
    expect(caps.publicSignupEnabled).toBe(true)
    // Public signup wins: the two paths are mutually exclusive.
    expect(caps.inviteOnlySignupEnabled).toBe(false)
  })

  it('is unavailable when neither is configured', () => {
    const caps = getAuthCapabilities({ ...BASE })
    expect(caps.publicSignupEnabled).toBe(false)
    expect(caps.inviteOnlySignupEnabled).toBe(false)
    expect(signupAvailable(caps)).toBe(false)
  })

  it('treats a blank invite code as not configured', () => {
    const caps = getAuthCapabilities({ ...BASE, SIGNUP_INVITE_CODE: '   ' })
    expect(caps.inviteOnlySignupEnabled).toBe(false)
  })

  it('is unavailable without Supabase configuration', () => {
    const caps = getAuthCapabilities({ SIGNUP_INVITE_CODE: 'relay-2026' })
    expect(caps.emailPasswordEnabled).toBe(false)
    expect(caps.inviteOnlySignupEnabled).toBe(false)
    expect(caps.publicSignupEnabled).toBe(false)
  })
})

describe('BUG-009 Google auth capability', () => {
  it('is enabled only when explicitly turned on', () => {
    expect(getAuthCapabilities({ ...BASE, RELAY_GOOGLE_AUTH_ENABLED: 'true' }).googleEnabled).toBe(true)
    expect(getAuthCapabilities({ ...BASE, RELAY_GOOGLE_AUTH_ENABLED: 'false' }).googleEnabled).toBe(false)
    expect(getAuthCapabilities(BASE).googleEnabled).toBe(false)
  })

  it('is never enabled without Supabase configuration', () => {
    expect(getAuthCapabilities({ RELAY_GOOGLE_AUTH_ENABLED: 'true' }).googleEnabled).toBe(false)
  })
})
