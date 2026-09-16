function normalize(message: unknown): string {
  if (!message) return "";
  return String(message).trim().toLowerCase();
}

export function humanizeSignupError(message: unknown): string {
  const value = normalize(message);

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
