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
  }
}

/** Whether any signup path is available at all. */
export function signupAvailable(capabilities: AuthCapabilities): boolean {
  return capabilities.publicSignupEnabled || capabilities.inviteOnlySignupEnabled
}
