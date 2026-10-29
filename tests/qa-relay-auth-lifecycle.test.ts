/**
 * Auth lifecycle contracts: callback redirect safety, capability truthfulness
 * and actionable signup errors.
 *
 * These are the deterministic parts of AUTH_ONBOARDING_GATE. The end-to-end
 * invite/Google flows need a running app and a live Supabase project; they are
 * covered by the browser gate, not here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { safeNextPath } from '@/app/auth/callback/route'
import { humanizeSignupError } from '@/lib/auth/error-messages'
import { getAuthCapabilities, getRuntimeAuthCapabilities, signupAvailable } from '@/lib/auth/capabilities'

const ORIGIN = 'https://relay.example.com'
const BASE = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AUTH_CALLBACK_IDEMPOTENT / open redirect', () => {
  it('keeps a same-origin deep link and its query', () => {
    expect(safeNextPath('/leads/123?tab=conversation', ORIGIN)).toBe('/leads/123?tab=conversation')
  })

  it('defaults to the app root', () => {
    expect(safeNextPath(null, ORIGIN)).toBe('/')
    expect(safeNextPath('', ORIGIN)).toBe('/')
  })

  it.each([
    'https://evil.example.com/steal',
    '//evil.example.com/steal',
    'javascript:alert(1)',
    '/\\evil.example.com',
  ])('rejects an off-origin destination: %s', (requested) => {
    expect(safeNextPath(requested, ORIGIN)).toBe('/')
  })
})

describe('BUG008_INVITE_SIGNUP error mapping', () => {
  it.each([
    ['INVITE_REQUIRED|', /invitation-only/i],
    ['INVITE_INVALID|', /not valid/i],
    ['SIGNUP_DISABLED|', /disabled/i],
    ['EMAIL_ALREADY_REGISTERED|', /already registered/i],
    ['RATE_LIMITED|', /Too many/i],
    ['ORG_CREATION_FAILED|', /Nothing was saved/i],
    ['MEMBERSHIP_CREATION_FAILED|', /Nothing was saved/i],
    ['ROLE_ASSIGNMENT_FAILED|', /Nothing was saved/i],
  ])('%s is actionable', (message, pattern) => {
    expect(humanizeSignupError(message)).toMatch(pattern)
  })

  it('never collapses a workspace failure into a generic account error', () => {
    expect(humanizeSignupError('ORG_CREATION_FAILED|Could not create organization.')).not.toMatch(
      /check your details/i,
    )
  })
})

describe('BUG009_GOOGLE_CAPABILITY truthfulness', () => {
  it('does not advertise Google when the provider is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ external: { email: true, google: false } }), { status: 200 })))
    const caps = await getRuntimeAuthCapabilities({ ...BASE, RELAY_GOOGLE_AUTH_ENABLED: 'true' })
    expect(caps.googleEnabled).toBe(false)
  })

  it('advertises Google only when the env opt-in AND the provider agree', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ external: { email: true, google: true } }), { status: 200 })))
    expect((await getRuntimeAuthCapabilities({ ...BASE, RELAY_GOOGLE_AUTH_ENABLED: 'true' })).googleEnabled).toBe(true)
    expect((await getRuntimeAuthCapabilities({ ...BASE })).googleEnabled).toBe(false)
  })

  it('fails closed when the provider probe fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const caps = await getRuntimeAuthCapabilities({ ...BASE, RELAY_GOOGLE_AUTH_ENABLED: 'true' })
    expect(caps.googleEnabled).toBe(false)
  })

  it('password reset is only offered when email auth is configured', () => {
    expect(getAuthCapabilities(BASE).passwordResetEnabled).toBe(true)
    expect(getAuthCapabilities({}).passwordResetEnabled).toBe(false)
  })

  it('signup availability stays mutually exclusive', () => {
    const caps = getAuthCapabilities({ ...BASE, SIGNUP_PUBLIC: 'true', SIGNUP_INVITE_CODE: 'x' })
    expect(signupAvailable(caps)).toBe(true)
    expect(caps.publicSignupEnabled).toBe(true)
    expect(caps.inviteOnlySignupEnabled).toBe(false)
  })
})
