function normalize(message: unknown): string {
  if (!message) return "";
  return String(message).trim().toLowerCase();
}

export function humanizeSignupError(message: unknown): string {
  const value = normalize(message);
  const raw = String(message ?? "").trim();

  // Server error codes are explicit; map each to an actionable sentence rather
  // than collapsing every failure into "Could not create your account".
  const code = raw.split("|")[0].toUpperCase();
  switch (code) {
    case "INVITE_REQUIRED":
      return "Relay access is invitation-only. Enter the invite code from your workspace admin.";
    case "INVITE_INVALID":
      return "That invite code is not valid. Check it with your workspace admin.";
    case "SIGNUP_DISABLED":
      return "Relay signup is currently disabled. Ask your workspace admin for an invitation.";
    case "EMAIL_ALREADY_REGISTERED":
      return "That email is already registered. Try signing in instead.";
    case "RATE_LIMITED":
      return "Too many attempts right now. Please wait a minute and try again.";
    case "ORG_CREATION_FAILED":
    case "MEMBERSHIP_CREATION_FAILED":
    case "ROLE_ASSIGNMENT_FAILED":
    case "SIGNUP_FAILED":
      return "Your account was not created because the workspace could not be set up. Nothing was saved — please try again.";
    case "INVALID_INPUT":
      return "Check the workspace name, email, and password (8+ characters).";
    case "ACCOUNT_CREATION_FAILED":
      return "Could not create your account. Please check your details and try again.";
  }

  if (!value) return "Could not create your account. Please try again.";
  if (value.includes("already") || value.includes("in use")) {
    return "That email is already registered. Try signing in instead.";
  }
  if (value.includes("too many") || value.includes("rate limit")) {
    return "Too many attempts right now. Please wait a minute and try again.";
  }
  if (value.includes("temporarily unavailable") || value.includes("503")) {
    return "Relay signup is temporarily unavailable. Please try again shortly.";
  }

  return "Could not create your account. Please check your details and try again.";
}

export function humanizeSignInError(message: unknown): string {
  const value = normalize(message);

  if (!value) return "Could not sign you in. Please try again.";
  if (value.includes("invalid login") || value.includes("invalid credentials")) {
    return "Could not sign you in. Check your email and password and try again.";
  }
  if (value.includes("email not confirmed") || value.includes("not confirmed")) {
    return "Your email is not verified yet. Confirm your inbox link, then sign in.";
  }
  if (value.includes("not linked to a relay workspace")) {
    return "This email is valid, but it is not linked to a Relay workspace yet. Ask an admin to invite you or create a new workspace.";
  }
  if (value.includes("not persisting the session cookie")) {
    return "Sign-in succeeded, but your browser blocked Relay session cookies. Allow cookies for this site, then sign in again.";
  }
  if (value.includes("too many") || value.includes("rate limit")) {
    return "Too many sign-in attempts. Please wait and try again.";
  }

  return "Could not sign you in right now. Please try again.";
}

export function humanizeMagicLinkError(message: unknown): string {
  const value = normalize(message);

  if (!value) return "Could not send the sign-in link. Please try again.";
  if (value.includes("rate limit") || value.includes("too many")) {
    return "Too many link requests. Please wait and try again.";
  }

  return "Could not send the sign-in link right now. Please try again.";
}

export function humanizePasswordResetError(message: unknown): string {
  const value = normalize(message);

  if (!value) return "Could not complete this request. Please try again.";
  if (value.includes("expired") || value.includes("invalid") || value.includes("session missing")) {
    return "This link is no longer valid. Request a new reset link and try again.";
  }
  if (value.includes("weak") || value.includes("password")) {
    return "Use a stronger password and try again.";
  }

  return "Could not complete this request. Please try again.";
}

export function humanizeOauthError(message: unknown): string {
  const value = normalize(message);
  if (!value) return "Google sign-in is unavailable right now. Please use email and password.";
  if (value.includes("provider") || value.includes("oauth")) {
    return "Google sign-in is not configured for this environment.";
  }
  return "Could not continue with Google right now. Please use email and password.";
}
