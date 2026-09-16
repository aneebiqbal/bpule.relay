"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { getAttribution, track } from "@/lib/analytics/track";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { humanizeSignupError } from "@/lib/auth/error-messages";
import {
  RelayAuthShell,
  RelayAuthSurface,
  RelayField,
  RelaySubmitButton,
  maskEmailAddress,
} from "@/components/auth/relay-auth-shell";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CompletionState = {
  email: string;
  orgName: string;
};

export function SignupExperience() {
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    track(AnalyticsEvents.SIGNUP_STARTED, getAttribution());
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timeout = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [cooldown]);

  const trimmedEmail = email.trim().toLowerCase();
  const orgValid = orgName.trim().length >= 2;
  const emailValid = EMAIL_RE.test(trimmedEmail);
  const passwordValid = password.length >= 8;
  const canSubmit = orgValid && emailValid && passwordValid && !busy;

  const passwordSignals = useMemo(
    () => [
      { label: "8+ characters", ready: password.length >= 8 },
      { label: "Has a number", ready: /\d/.test(password) },
      { label: "Has a letter", ready: /[a-zA-Z]/.test(password) },
    ],
    [password],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    setResent(false);
    setResendError(null);

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName: orgName.trim(),
          email: trimmedEmail,
          password,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Signup failed");
      }

      track(AnalyticsEvents.SIGNUP_COMPLETED, {
        ...getAttribution(),
        org_name: orgName.trim(),
      });
      setCompletion({ email: trimmedEmail, orgName: orgName.trim() });
    } catch (cause) {
      setError(humanizeSignupError(cause instanceof Error ? cause.message : ""));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    const targetEmail = completion?.email ?? trimmedEmail;
    if (!targetEmail || cooldown > 0 || resending) return;

    setResending(true);
    setResendError(null);

    try {
      const supabase = getBrowserSupabase();
      const { error: authError } = await supabase.auth.resend({
        type: "signup",
        email: targetEmail,
      });

      if (authError) throw authError;

      setResent(true);
      setCooldown(60);
    } catch (cause) {
      setResendError(humanizeSignupError(cause instanceof Error ? cause.message : ""));
    } finally {
      setResending(false);
    }
  }

  const doneEmail = completion?.email ?? trimmedEmail;

  return (
    <RelayAuthShell
      stateLabel="RELAY / LINK"
      heading="Build your Relay workspace in one minute"
      subheading="Start free, no card. Relay sets the route, then helps you move from signal to real outreach."
      contextLabel="What appears after this"
      contextPoints={[
        { title: "Identity", detail: "Email confirmation secures your workspace and teammate invites." },
        { title: "Routing", detail: "Onboarding maps your role so Relay can prioritize your first action." },
        { title: "Proof", detail: "Your first profile and queue actions start immediately after setup." },
      ]}
    >
      <RelayAuthSurface
        chapter="Start free"
        title={completion ? "Confirm your inbox" : "Create your account"}
        subtitle={
          completion
            ? `We sent a verification link to ${maskEmailAddress(doneEmail)}.`
            : "You become the first admin. Add teammates after onboarding."
        }
      >
        {completion ? (
          <div className="auth-step-enter space-y-3">
            <p className="auth-inline-alert is-success" role="status">
              Workspace {completion.orgName} is provisioned. Open your email link, then sign in.
            </p>

            <div className="auth-note-strip">
              If you do not see the email, check promotions/spam first. Verification links can take up to a minute.
            </div>

            <button
              type="button"
              onClick={resendVerification}
              className="relay-cta-quiet w-full"
              disabled={resending || cooldown > 0}
            >
              {cooldown > 0 ? `Resend available in ${cooldown}s` : resending ? "Sending..." : "Resend verification email"}
            </button>

            {resendError ? (
              <p className="auth-inline-alert" role="alert">
                {resendError}
              </p>
            ) : null}

            {resent && !resendError ? (
              <p className="auth-field__message is-success" role="status">
                Verification email sent.
              </p>
            ) : null}

            <div className="flex flex-col gap-2 text-sm">
              <Link href="/login" className="text-[var(--ink)] underline-offset-4 hover:underline">
                Continue to sign in
              </Link>
              <button
                type="button"
                className="text-left text-[var(--graphite)] underline-offset-4 hover:underline"
                onClick={() => {
                  setCompletion(null);
                  setResent(false);
                  setResendError(null);
                }}
              >
                Use a different email
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-step-enter space-y-4" noValidate>
            {error ? (
              <p className="auth-inline-alert" role="alert">
                {error}
              </p>
            ) : null}

            <RelayField
              label="Organization"
              htmlFor="signup-org"
              hint="Use your company or operating brand name."
              error={orgName.trim().length > 0 && !orgValid ? "Use at least 2 characters." : null}
            >
              <input
                id="signup-org"
                className="auth-input"
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="Acme Delivery Co."
                autoComplete="organization"
              />
            </RelayField>

            <RelayField
              label="Work email"
              htmlFor="signup-email"
              hint="We send a verification link before first sign-in."
              error={trimmedEmail.length > 0 && !emailValid ? "Enter a valid email address." : null}
            >
              <input
                id="signup-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </RelayField>

            <RelayField
              label="Password"
              htmlFor="signup-password"
              hint="At least 8 characters."
              error={password.length > 0 && !passwordValid ? `${8 - password.length} more characters needed.` : null}
            >
              <input
                id="signup-password"
                className="auth-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Create a secure password"
              />
            </RelayField>

            {password.length > 0 ? (
              <div className="grid gap-1 text-xs text-[var(--graphite)]" aria-live="polite">
                {passwordSignals.map((signal) => (
                  <p key={signal.label} className={signal.ready ? "text-[var(--status-success)]" : "text-[var(--stone)]"}>
                    {signal.ready ? "OK" : "--"} {signal.label}
                  </p>
                ))}
              </div>
            ) : null}

            <RelaySubmitButton idleLabel="Create Relay workspace" busyLabel="Provisioning workspace" busy={busy} disabled={!canSubmit} />
          </form>
        )}
      </RelayAuthSurface>

      <div className="mt-3 text-center text-sm text-[var(--graphite)]">
        Already have access?{" "}
        <Link href="/login" className="text-[var(--ink)] underline-offset-4 hover:underline">
          Sign in
        </Link>
      </div>
    </RelayAuthShell>
  );
}
