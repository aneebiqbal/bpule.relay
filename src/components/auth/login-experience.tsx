"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  humanizeMagicLinkError,
  humanizeOauthError,
  humanizeSignInError,
} from "@/lib/auth/error-messages";
import {
  RelayAuthShell,
  RelayAuthSurface,
  RelayField,
  RelaySubmitButton,
  maskEmailAddress,
} from "@/components/auth/relay-auth-shell";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LoginMode = "password" | "magic";
type BusyMode = "password" | "magic" | "google" | null;

type LoginExperienceProps = {
  demoMode: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForServerSession(): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch("/api/me/status", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    }).catch(() => null);

    if (response?.ok) return true;
    await sleep(150);
  }

  return false;
}

async function checkWorkspaceMapping(): Promise<{ ok: boolean; noWorkspace: boolean }> {
  const response = await fetch("/api/me/status", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  }).catch(() => null);

  if (!response) return { ok: false, noWorkspace: false };
  if (response.ok) return { ok: true, noWorkspace: false };

  if (response.status === 409) {
    return { ok: false, noWorkspace: true };
  }

  return { ok: false, noWorkspace: false };
}

function sanitizeNextPath(value: string | null): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  return value;
}

export function LoginExperience({ demoMode }: LoginExperienceProps) {
  const searchParams = useSearchParams();

  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get("next")), [searchParams]);
  const queryError = useMemo(() => {
    const code = searchParams.get("error");
    if (!code) return null;
    if (code === "no_workspace") {
      return "This email is authenticated but not linked to any Relay workspace. Ask an admin to invite this email, or create a new workspace.";
    }
    if (code === "auth_callback_failed") {
      return "Could not finish sign-in from the email/provider callback. Please try again.";
    }
    if (code === "missing_code") {
      return "Sign-in link is incomplete or expired. Request a new one.";
    }
    return null;
  }, [searchParams]);

  const [mode, setMode] = useState<LoginMode>("password");
  const [busy, setBusy] = useState<BusyMode>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(normalizedEmail);

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailValid || !password || busy) return;

    setBusy("password");
    setError(null);

    try {
      const supabase = getBrowserSupabase();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError) {
        throw authError;
      }

      const serverSessionReady = await waitForServerSession();
      if (!serverSessionReady) {
        const workspaceCheck = await checkWorkspaceMapping();
        if (workspaceCheck.noWorkspace) {
          await supabase.auth.signOut().catch(() => undefined);
          throw new Error(
            "This email is authenticated but not linked to any Relay workspace. Ask an admin to invite this email, or create a new workspace.",
          );
        }

        await supabase.auth.signOut().catch(() => undefined);
        throw new Error(
          "Signed in, but this browser is not persisting the session cookie. Please allow cookies for this site and try again.",
        );
      }

      track(AnalyticsEvents.LOGIN_COMPLETED, { method: "password" });
      window.location.assign(nextPath);
      return;
    } catch (cause) {
      const message = humanizeSignInError(cause instanceof Error ? cause.message : "");
      setError(message);
      track(AnalyticsEvents.AUTH_FAILED, { method: "password", error_code: message.slice(0, 80) });
    } finally {
      setBusy(null);
    }
  }

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailValid || busy) return;

    setBusy("magic");
    setError(null);

    try {
      const supabase = getBrowserSupabase();
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: callbackUrl,
        },
      });

      if (authError) throw authError;
      setMagicSent(true);
    } catch (cause) {
      const message = humanizeMagicLinkError(cause instanceof Error ? cause.message : "");
      setError(message);
      track(AnalyticsEvents.AUTH_FAILED, { method: "magic", error_code: message.slice(0, 80) });
    } finally {
      setBusy(null);
    }
  }

  async function continueWithGoogle() {
    if (busy) return;
    setBusy("google");
    setError(null);

    try {
      const supabase = getBrowserSupabase();
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl,
        },
      });

      if (authError) {
        throw authError;
      }

      if (data?.url) {
        window.location.assign(data.url);
        return;
      }

      setBusy(null);
    } catch (cause) {
      const message = humanizeOauthError(cause instanceof Error ? cause.message : "");
      setError(message);
      setBusy(null);
      track(AnalyticsEvents.AUTH_FAILED, { method: "google", error_code: message.slice(0, 80) });
    }
  }

  if (demoMode) {
    return (
      <RelayAuthShell
        stateLabel="RELAY / DEMO"
        heading="Demo mode is active"
        subheading="This environment runs without Supabase auth. Enter directly with demo admin access."
        contextLabel="Demo behavior"
        contextPoints={[
          { title: "Session", detail: "No external auth provider is required." },
          { title: "Data", detail: "In-memory store resets when the process restarts." },
          { title: "Permissions", detail: "You can explore admin-only workflows." },
        ]}
      >
        <RelayAuthSurface
          chapter="Demo build"
          title="Jump into Relay"
          subtitle="You can still inspect the production auth pages in non-demo deployments."
        >
          <Link href="/" className="relay-cta auth-submit justify-between">
            <span className="relay-cta-pulse" aria-hidden="true" />
            <span>Enter demo workspace</span>
            <span className="relay-cta-arrow" aria-hidden="true">
              -&gt;
            </span>
          </Link>
        </RelayAuthSurface>
      </RelayAuthShell>
    );
  }

  return (
    <RelayAuthShell
      stateLabel="RELAY / REJOIN"
      heading="Welcome back to your signal desk"
      subheading="Pick up from your queue, your proof, and your next highest-leverage move."
      contextLabel="After sign in"
      contextPoints={[
        { title: "Queue", detail: "Resume your live opportunity routing instantly." },
        { title: "Studio", detail: "Continue writing in your calibrated voice profile." },
        { title: "Activation", detail: "If setup is incomplete, Relay returns you to onboarding." },
      ]}
    >
      <RelayAuthSurface
        chapter="Sign in"
        title={magicSent ? "Magic link sent" : "Access your workspace"}
        subtitle={
          magicSent
            ? `Open the sign-in link sent to ${maskEmailAddress(normalizedEmail)} in this browser.`
            : "Use password, magic link, or Google if your workspace has it enabled."
        }
      >
        {magicSent ? (
          <div className="auth-step-enter space-y-3">
            <p className="auth-inline-alert is-success" role="status">
              Check your inbox. The link signs you in and routes you back to your workspace.
            </p>
            <button type="button" className="relay-cta-quiet w-full" onClick={() => setMagicSent(false)}>
              Use password instead
            </button>
          </div>
        ) : (
          <form onSubmit={mode === "password" ? signInWithPassword : sendMagicLink} className="auth-step-enter space-y-4" noValidate>
            {error || queryError ? (
              <p className="auth-inline-alert" role="alert">
                {error ?? queryError}
              </p>
            ) : null}

            <RelayField
              label="Work email"
              htmlFor="login-email"
              hint="Use the same address used for your Relay account."
              error={normalizedEmail.length > 0 && !emailValid ? "Enter a valid email address." : null}
            >
              <input
                id="login-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </RelayField>

            {mode === "password" ? (
              <RelayField label="Password" htmlFor="login-password" hint="Use your account password.">
                <input
                  id="login-password"
                  className="auth-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
                />
              </RelayField>
            ) : null}

            <RelaySubmitButton
              idleLabel={mode === "password" ? "Sign in with password" : "Email me a magic link"}
              busyLabel={mode === "password" ? "Signing in" : "Sending link"}
              busy={busy === "password" || busy === "magic"}
              disabled={!emailValid || (mode === "password" && password.length === 0)}
            />

            <div className="flex flex-col gap-2 text-sm">
              <button
                type="button"
                className="text-left text-[var(--graphite)] underline-offset-4 hover:text-[var(--ink)] hover:underline"
                onClick={() => setMode((current) => (current === "password" ? "magic" : "password"))}
              >
                {mode === "password" ? "Prefer a magic link instead" : "Use password instead"}
              </button>
              <Link href="/forgot-password" className="text-left text-[var(--graphite)] underline-offset-4 hover:text-[var(--ink)] hover:underline">
                Forgot your password?
              </Link>
            </div>

            <div className="auth-note-strip space-y-2">
              <p className="text-[0.73rem] uppercase tracking-[0.11em] text-[var(--stone)]">Alternative route</p>
              <button
                type="button"
                className="relay-cta-quiet w-full"
                onClick={continueWithGoogle}
                disabled={busy !== null}
              >
                {busy === "google" ? "Redirecting to Google..." : "Continue with Google"}
              </button>
            </div>
          </form>
        )}
      </RelayAuthSurface>

      <div className="mt-3 text-center text-sm text-[var(--graphite)]">
        New to Relay?{" "}
        <Link href="/signup" className="text-[var(--ink)] underline-offset-4 hover:underline">
          Create your account
        </Link>
      </div>
    </RelayAuthShell>
  );
}
