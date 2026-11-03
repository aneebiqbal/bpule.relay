import { beforeEach, describe, expect, it, vi } from 'vitest'

// `createNeonAuth` pulls in `next/headers`, which only resolves under the
// Next.js bundler — not under vitest's Node resolver. Mock the SDK so the
// provider's own logic is what is under test.
vi.mock('@neon/auth/next/server', () => ({
  createNeonAuth: vi.fn(() => ({})),
}))

import { resolveAuthProvider } from '@/lib/auth/contract'
import { getAuthProvider, isNeonAuthProvider } from '@/lib/auth/provider'
import { getNeonAuthInstance } from '@/lib/auth/neon-server'

/**
 * The auth adapter is the cutover path, so its selection and its failure modes
 * are asserted directly. A silent fallback to Supabase would defeat the point
 * of the flag; a thrown error at import time would break a deployment that has
 * no Neon Auth configured.
 */

describe('auth provider selection', () => {
  const original = process.env.RELAY_AUTH_PROVIDER
  const originalPublic = process.env.NEXT_PUBLIC_RELAY_AUTH_PROVIDER
  const originalGlobal = (globalThis as Record<string, unknown>).__RELAY_AUTH_PROVIDER__

  beforeEach(() => {
    if (original === undefined) delete process.env.RELAY_AUTH_PROVIDER
    else process.env.RELAY_AUTH_PROVIDER = original
    if (originalPublic === undefined) delete process.env.NEXT_PUBLIC_RELAY_AUTH_PROVIDER
    else process.env.NEXT_PUBLIC_RELAY_AUTH_PROVIDER = originalPublic
    if (originalGlobal === undefined) delete (globalThis as Record<string, unknown>).__RELAY_AUTH_PROVIDER__
    else (globalThis as Record<string, unknown>).__RELAY_AUTH_PROVIDER__ = originalGlobal
  })

  it('defaults to supabase so an opted-out deployment is unchanged', () => {
    delete process.env.RELAY_AUTH_PROVIDER
    delete process.env.NEXT_PUBLIC_RELAY_AUTH_PROVIDER
    delete (globalThis as Record<string, unknown>).__RELAY_AUTH_PROVIDER__
    expect(resolveAuthProvider()).toBe('supabase')
    expect(isNeonAuthProvider()).toBe(false)
  })

  it('selects neon only when explicitly configured', () => {
    process.env.RELAY_AUTH_PROVIDER = 'neon'
    expect(resolveAuthProvider()).toBe('neon')
    expect(isNeonAuthProvider()).toBe(true)
  })

  it('treats an unknown value as the rollback path', () => {
    process.env.RELAY_AUTH_PROVIDER = 'postgres'
    expect(resolveAuthProvider()).toBe('supabase')
  })

  it('is case-insensitive and tolerant of whitespace', () => {
    process.env.RELAY_AUTH_PROVIDER = '  NEON '
    expect(resolveAuthProvider()).toBe('neon')
  })

  it('reads the browser-facing variable, which Next.js inlines into the bundle', () => {
    // Next.js only inlines NEXT_PUBLIC_* names for the client bundle, so the
    // browser cannot see RELAY_AUTH_PROVIDER. Without this fallback the browser
    // silently signs in against Supabase while the server reads Neon.
    delete process.env.RELAY_AUTH_PROVIDER
    process.env.NEXT_PUBLIC_RELAY_AUTH_PROVIDER = 'neon'
    expect(resolveAuthProvider()).toBe('neon')
    delete process.env.NEXT_PUBLIC_RELAY_AUTH_PROVIDER
  })

  it('reads the provider the root layout bootstraps onto the page', () => {
    // Authoritative for the browser: it is what the server actually resolved,
    // so it cannot drift from the server's own provider.
    delete process.env.RELAY_AUTH_PROVIDER
    delete process.env.NEXT_PUBLIC_RELAY_AUTH_PROVIDER
    ;(globalThis as Record<string, unknown>).__RELAY_AUTH_PROVIDER__ = 'neon'
    expect(resolveAuthProvider()).toBe('neon')
    delete (globalThis as Record<string, unknown>).__RELAY_AUTH_PROVIDER__
    expect(resolveAuthProvider()).toBe('supabase')
  })

  it('returns the supabase provider by default without constructing Neon Auth', async () => {
    delete process.env.RELAY_AUTH_PROVIDER
    delete process.env.NEXT_PUBLIC_RELAY_AUTH_PROVIDER
    delete (globalThis as Record<string, unknown>).__RELAY_AUTH_PROVIDER__
    delete process.env.NEON_AUTH_BASE_URL
    const provider = await getAuthProvider()
    expect(provider.name).toBe('supabase')
  })
})

describe('neon auth configuration', () => {
  const baseUrl = process.env.NEON_AUTH_BASE_URL
  const secret = process.env.NEON_AUTH_COOKIE_SECRET

  beforeEach(() => {
    if (baseUrl === undefined) delete process.env.NEON_AUTH_BASE_URL
    else process.env.NEON_AUTH_BASE_URL = baseUrl
    if (secret === undefined) delete process.env.NEON_AUTH_COOKIE_SECRET
    else process.env.NEON_AUTH_COOKIE_SECRET = secret
  })

  it('fails loudly when the auth URL is missing', () => {
    delete process.env.NEON_AUTH_BASE_URL
    expect(() => getNeonAuthInstance()).toThrow(/NEON_AUTH_BASE_URL/)
  })

  it('refuses a cookie secret that is too short to sign with', () => {
    process.env.NEON_AUTH_BASE_URL = 'https://example.neon.tech/auth'
    process.env.NEON_AUTH_COOKIE_SECRET = 'too-short'
    expect(() => getNeonAuthInstance()).toThrow(/NEON_AUTH_COOKIE_SECRET/)
  })

  it('constructs once and reuses the instance', () => {
    process.env.NEON_AUTH_BASE_URL = 'https://example.neon.tech/auth'
    process.env.NEON_AUTH_COOKIE_SECRET = 'a-secret-that-is-at-least-32-characters-long'
    const first = getNeonAuthInstance()
    expect(getNeonAuthInstance()).toBe(first)
  })
})
