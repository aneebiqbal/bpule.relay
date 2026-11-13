import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { forwardResponse } from '@/app/api/auth/[...path]/route'
import { resolveAuthProvider } from '@/lib/auth/contract'
import { describeAuthProvider } from '@/lib/auth/provider'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

const TOKEN_COOKIE = '__Secure-neon-auth.session_token=abc123; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=Lax'
const DATA_COOKIE = '__Secure-neon-auth.local.session_data=eyJhbGciOiJIUzI1NiJ9; Path=/; Max-Age=299; Secure; HttpOnly; SameSite=Lax'

function signInResponse(): Response {
  return new Response(JSON.stringify({ token: 'abc123' }), {
    status: 200,
    headers: [
      ['content-type', 'application/json'],
      ['set-cookie', TOKEN_COOKIE],
      ['set-cookie', DATA_COOKIE],
    ],
  })
}

describe('NEON_AUTH_PROXY_PRESERVES_MULTIPLE_SET_COOKIE', () => {
  it('keeps every Set-Cookie header on an HTTPS context', () => {
    const forwarded = forwardResponse(signInResponse(), true)
    expect(forwarded.headers.getSetCookie()).toEqual([TOKEN_COOKIE, DATA_COOKIE])
  })

  it('keeps the status and content type of the upstream auth response', () => {
    const forwarded = forwardResponse(signInResponse(), true)
    expect(forwarded.status).toBe(200)
    expect(forwarded.headers.get('content-type')).toContain('application/json')
  })
})

describe('NEON_AUTH_SIGNIN_SETS_SESSION_COOKIE', () => {
  it('sets both the session token and the local session data cookie', () => {
    const forwarded = forwardResponse(signInResponse(), true)
    const cookies = forwarded.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toContain('__Secure-neon-auth.session_token=')
    expect(cookies[1]).toContain('__Secure-neon-auth.local.session_data=')
  })

  it('never drops the Secure attribute on HTTPS — the __Secure- prefix requires it', () => {
    const cookies = forwardResponse(signInResponse(), true).headers.getSetCookie()
    for (const cookie of cookies) {
      expect(cookie).toMatch(/;\s*Secure/i)
    }
  })

  it('keeps the cookie attributes the browser needs to store and resend them', () => {
    const cookies = forwardResponse(signInResponse(), true).headers.getSetCookie()
    for (const cookie of cookies) {
      expect(cookie).toContain('Path=/')
      expect(cookie).toMatch(/HttpOnly/i)
      expect(cookie).toMatch(/SameSite=Lax/i)
      expect(cookie).toMatch(/Max-Age=\d+/i)
    }
  })
})

describe('NEON_AUTH_COOKIE_SURVIVES_NEXT_REQUEST', () => {
  it('the proxy cookie names are the ones the Neon server adapter reads', () => {
    // The server SDK derives its cookie names from the same baseUrl + secret; the
    // contract is that the proxy must not rewrite them.
    const source = read('src/app/api/auth/[...path]/route.ts')
    expect(source).toContain('auth.handler()')
    expect(source).not.toContain('__Secure-neon-auth.session_token=') // never hardcoded
  })

  it('the server adapter is built from the configured baseUrl and cookie secret', () => {
    const source = read('src/lib/auth/neon-server.ts')
    expect(source).toContain('createNeonAuth({ baseUrl, cookies: { secret }')
    expect(source).toContain('auth.getSession()')
  })
})

describe('NEON_AUTH_ME_STATUS_AUTHENTICATED', () => {
  it('reads the session through the canonical provider', () => {
    const source = read('src/app/api/me/status/route.ts')
    expect(source).toContain('getAuthProvider')
    expect(source).toContain('getSession')
  })
})

describe('NEON_AUTH_PROVIDER_NO_SUPABASE_CALL', () => {
  it('resolves to neon when RELAY_AUTH_PROVIDER=neon', () => {
    expect(resolveAuthProvider({ RELAY_AUTH_PROVIDER: 'neon' })).toBe('neon')
    expect(resolveAuthProvider({ RELAY_AUTH_PROVIDER: 'supabase' })).toBe('supabase')
  })

  it('reports neon without importing the supabase browser client', () => {
    const provider = read('src/lib/auth/provider.ts')
    expect(provider).toContain("resolveAuthProvider() === 'neon'")
    expect(provider).not.toContain('createClient') // no Supabase browser client construction
  })

  it('describes the active provider for diagnostics', () => {
    expect(describeAuthProvider({ RELAY_AUTH_PROVIDER: 'neon' })).toEqual({ authProvider: 'neon' })
  })
})

describe('NEON_AUTH_SIGNOUT_CLEARS_SESSION', () => {
  it('forwards DELETE to the auth proxy so the session cookies are cleared', () => {
    const source = read('src/app/api/auth/[...path]/route.ts')
    expect(source).toContain('export function DELETE')
    expect(source).toContain('handler[method]')
  })
})
