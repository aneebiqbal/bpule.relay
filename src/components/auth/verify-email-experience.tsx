"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { humanizeSignupError } from "@/lib/auth/error-messages";
import {
  RelayAuthShell,
  RelayAuthSurface,
  RelayField,
  maskEmailAddress,
} from "@/components/auth/relay-auth-shell";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function VerifyEmailExperience() {
  const searchParams = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get("email") ?? "", [searchParams]);

  const [email, setEmail] = useState(initialEmail);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timeout = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [cooldown]);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(normalizedEmail);

  async function resendVerification() {
    if (!emailValid || resending || cooldown > 0) return;

    setResending(true);
    setError(null);

    try {
      const supabase = getBrowserSupabase();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
      });

      if (resendError) throw resendError;
      setResent(true);
      setCooldown(60);
    } catch (cause) {
      setError(humanizeSignupError(cause instanceof Error ? cause.message : ""));
      setResent(false);
    } finally {
      setResending(false);
    }
  }

  return (
    <RelayAuthShell
      stateLabel="RELAY / VERIFY"
      heading="Identity check before launch"
      subheading="Confirm your email so Relay can complete your workspace routing and secure account recovery."
      contextLabel="Why verification matters"
      contextPoints={[
        { title: "Security", detail: "Prevents unauthorized workspace access." },
        { title: "Recovery", detail: "Allows password reset and trusted login links." },
        { title: "Activation", detail: "Unlocks onboarding and queue access." },
      ]}
    >
      <RelayAuthSurface
        chapter="Verification"
        title="Check your inbox"
        subtitle={
          emailValid
            ? `We are waiting for confirmation from ${maskEmailAddress(normalizedEmail)}.`
            : "Enter your signup email to resend the confirmation link."
        }
      >
        <div className="auth-step-enter space-y-4">
          <RelayField
            label="Email"
            htmlFor="verify-email"
            hint="Use the exact email used during signup."
            error={normalizedEmail.length > 0 && !emailValid ? "Enter a valid email address." : null}
          >
            <input
              id="verify-email"
              className="auth-input"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </RelayField>

          <div className="auth-note-strip">
            Verification links are one-time use. Open the latest email in this browser session.
          </div>

          {error ? (
            <p className="auth-inline-alert" role="alert">
              {error}
            </p>
          ) : null}

          {resent && !error ? (
            <p className="auth-inline-alert is-success" role="status">
              Verification email sent. Check your inbox and spam folders.
            </p>
          ) : null}

          <button
            type="button"
            className="relay-cta auth-submit justify-between"
            onClick={resendVerification}
            disabled={!emailValid || resending || cooldown > 0}
          >
            <span className="relay-cta-pulse" aria-hidden="true" />
            <span>{cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending verification" : "Resend verification email"}</span>
            <span className="relay-cta-arrow" aria-hidden="true">
              -&gt;
            </span>
          </button>

          <div className="flex flex-col gap-2 text-sm">
            <Link href="/login" className="text-[var(--ink)] underline-offset-4 hover:underline">
              Back to sign in
            </Link>
            <Link href="/signup" className="text-[var(--graphite)] underline-offset-4 hover:underline">
              Create a different account
            </Link>
          </div>
        </div>
      </RelayAuthSurface>
    </RelayAuthShell>
  );
}
