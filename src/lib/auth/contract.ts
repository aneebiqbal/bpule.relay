/**
 * Canonical authentication contract.
 *
 * The application never talks to a concrete auth vendor. Two providers sit
 * behind this contract:
 *
 *   - `supabase` — the existing Supabase Auth client (rollback path)
 *   - `neon`     — Neon Auth, the managed Better Auth service on the Neon branch
 *   - `aiven`    — Better Auth running in-app against the `neon_auth` schema on Aiven
 *
 * `RELAY_AUTH_PROVIDER` selects one. It defaults to `supabase` so a deployment
 * that has not opted in behaves exactly as it did before.
 *
 * Authorization authority (which organisation and role a person has) always
 * comes from Relay's own `reps` / `organization_roles` rows — never from auth
 * metadata, which the browser could otherwise influence.
 */

export type AuthProviderName = 'supabase' | 'neon' | 'aiven'

/**
 * The provider the server rendered into the page. See `resolveAuthProvider`.
 */
function readBrowserFlag(name: string): string | undefined {
  if (typeof globalThis === 'undefined') return undefined
  const value = (globalThis as Record<string, unknown>)[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Resolve the configured provider.
 *
 * `RELAY_AUTH_PROVIDER` is the server-side variable. Next.js only inlines
 * `NEXT_PUBLIC_*` names into the client bundle, and that inlining is not
 * dependable in every runtime, so the root layout also writes the resolved
 * provider onto `globalThis` — authoritative for the browser, and impossible to
 * drift from what the server is using. Anything unrecognised falls back to
 * `supabase`, the rollback path.
 */
export function resolveAuthProvider(env: NodeJS.ProcessEnv = process.env): AuthProviderName {
  const value = (
    env.RELAY_AUTH_PROVIDER ??
    env.NEXT_PUBLIC_RELAY_AUTH_PROVIDER ??
    readBrowserFlag('__RELAY_AUTH_PROVIDER__')
  )
    ?.trim()
    .toLowerCase()
  if (value === 'neon') return 'neon'
  if (value === 'aiven' || value === 'better-auth') return 'aiven'
  return 'supabase'
}

export interface AuthUser {
  id: string
  email: string
  name: string | null
}

export interface AuthSession {
  user: AuthUser | null
}

export interface AuthFailure {
  message: string
}

/** How an auth error should be surfaced. */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'USER_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNKNOWN'

export interface AuthProvider {
  readonly name: AuthProviderName

  /**
   * Server-side: the signed-in user for this request.
   *
   * Supabase: the authoritative Auth service check (a local JWT that fails to
   * verify is treated as inconclusive, never as a sign-out).
   * Neon: the Better Auth session, resolved from the request's cookies.
   */
  getSession(): Promise<AuthSession>

  /** Browser: sign in with email and password. */
  signInWithPassword(email: string, password: string): Promise<AuthFailure | null>

  /** Browser: email a one-time sign-in link. */
  signInWithOtp(email: string): Promise<AuthFailure | null>

  /**
   * Browser: start an OAuth flow.
   * Supabase returns the provider URL to redirect to; Neon Auth handles the
   * redirect itself, so the browser just needs to be sent to the provider.
   */
  signInWithOAuth(provider: 'google', redirectTo: string): Promise<{ url?: string; error?: AuthFailure }>

  /** Browser: end the session. */
  signOut(): Promise<void>

  /** Browser: email a password-reset link. */
  resetPasswordForEmail(email: string, redirectTo: string): Promise<AuthFailure | null>

  /** Browser: set a new password from the reset link. */
  updatePassword(password: string): Promise<AuthFailure | null>

  /** Browser: resend the verification email. */
  resendVerification(email: string): Promise<AuthFailure | null>

  /** Callback: exchange an authorization code for a session. */
  exchangeCodeForSession?(code: string): Promise<{ user?: AuthUser; error?: AuthFailure }>

  /**
   * Server admin: create a user.
   *
   * Neon Auth requires the *caller* to hold the admin role; the SDK reads the
   * caller's cookies from the current request, so this must run inside a
   * request scope. Supabase uses the service role instead.
   */
  createUser(params: { email: string; password: string; name?: string }): Promise<{
    userId?: string
    error?: AuthFailure
  }>

  /** Server admin: delete a user and revoke their sessions. */
  deleteUser(userId: string): Promise<void>

  /** Server admin: revoke every session for a user without deleting them. */
  signOutUser(userId: string): Promise<void>
}

/**
 * The half of the contract a client component needs. Server code uses the full
 * `AuthProvider`; the browser cannot reach `getSession` or the admin methods.
 */
export type BrowserAuthProvider = Pick<
  AuthProvider,
  | 'name'
  | 'signInWithPassword'
  | 'signInWithOtp'
  | 'signInWithOAuth'
  | 'signOut'
  | 'resetPasswordForEmail'
  | 'updatePassword'
  | 'resendVerification'
>
