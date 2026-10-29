/**
 * Auth capabilities — what this deployment can actually execute.
 *
 * Product contract: "UI cannot advertise an authentication capability the
 * deployment cannot execute."
 *
 * The UI renders from these flags, never from an assumption. A Google button
 * on a deployment without Google OAuth configured, or a public Create
 * Workspace form on an invite-only deployment, is a capability the deployment
 * cannot honour.
 */

export interface AuthCapabilities {
  /** Email + password sign-in is configured. */
  emailPasswordEnabled: boolean
  /** Google OAuth is configured and enabled for this deployment. */
  googleEnabled: boolean
  /** Anyone may create a workspace. */
  publicSignupEnabled: boolean
  /** Only holders of an invite code may create a workspace. */
  inviteOnlySignupEnabled: boolean
  /** Email password recovery is available. */
  passwordResetEnabled: boolean
}

/**
 * Resolve the capabilities from the deployment configuration.
 *
 * `publicSignupEnabled` and `inviteOnlySignupEnabled` are mutually exclusive:
 * public signup wins only when it is explicitly turned on, otherwise an invite
 * code means invite-only, and neither means signup is unavailable.
 */
export function getAuthCapabilities(env: NodeJS.ProcessEnv = process.env): AuthCapabilities {
  const supabaseConfigured = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const publicSignup = env.SIGNUP_PUBLIC === 'true'
  const inviteCode = typeof env.SIGNUP_INVITE_CODE === 'string' && env.SIGNUP_INVITE_CODE.trim().length > 0

  return {
    emailPasswordEnabled: supabaseConfigured,
    googleEnabled: supabaseConfigured && env.RELAY_GOOGLE_AUTH_ENABLED === 'true',
    publicSignupEnabled: supabaseConfigured && publicSignup,
    inviteOnlySignupEnabled: supabaseConfigured && !publicSignup && inviteCode,
    passwordResetEnabled: supabaseConfigured,
  }
}

/** Whether any signup path is available at all. */
export function signupAvailable(capabilities: AuthCapabilities): boolean {
  return capabilities.publicSignupEnabled || capabilities.inviteOnlySignupEnabled
}

/**
 * Capabilities confirmed against the live Supabase auth configuration.
 *
 * The env flag is an operator opt-in; it is not proof the provider is enabled.
 * `GET /auth/v1/settings` is the authoritative list of providers this project
 * can actually complete, so a Google button is only rendered when BOTH agree.
 * Falls back to "not available" on any probe failure — never advertise a
 * capability that could not be verified.
 */
export async function getRuntimeAuthCapabilities(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AuthCapabilities> {
  const base = getAuthCapabilities(env)
  if (!base.emailPasswordEnabled) return base

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      // Settings change rarely; a short cache keeps every page load cheap.
      next: { revalidate: 300 },
      // A slow provider must never delay the login page.
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return { ...base, googleEnabled: false }
    const settings = (await res.json()) as { external?: Record<string, boolean> }
    const external = settings.external ?? {}
    return {
      ...base,
      // `email` is the password provider. Absent means "not advertised".
      emailPasswordEnabled: base.emailPasswordEnabled && external.email !== false,
      passwordResetEnabled: base.passwordResetEnabled && external.email !== false,
      googleEnabled: base.googleEnabled && external.google === true,
    }
  } catch {
    return { ...base, googleEnabled: false }
  }
}
