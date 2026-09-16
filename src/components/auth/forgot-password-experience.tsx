"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { humanizePasswordResetError } from "@/lib/auth/error-messages";
import {
  RelayAuthShell,
  RelayAuthSurface,
  RelayField,
  RelaySubmitButton,
  maskEmailAddress,
} from "@/components/auth/relay-auth-shell";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordExperience() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(normalizedEmail);

  async function sendReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailValid || busy) return;

    setBusy(true);
    setError(null);

    try {
      const supabase = getBrowserSupabase();
      const { error: authError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (authError) throw authError;

      setSentTo(normalizedEmail);
    } catch (cause) {
      setError(humanizePasswordResetError(cause instanceof Error ? cause.message : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RelayAuthShell
      stateLabel="RELAY / RECOVER"
      heading="Reset access without losing momentum"
      subheading="Request a secure reset link. Once confirmed, you can re-enter Relay immediately."
      contextLabel="What happens next"
      contextPoints={[
        { title: "Link", detail: "A one-time reset link is delivered to your inbox." },
        { title: "Confirm", detail: "You choose a new password in this browser session." },
        { title: "Resume", detail: "Relay routes you back to login and your workspace." },
      ]}
    >
      <RelayAuthSurface
        chapter="Password recovery"
        title={sentTo ? "Reset link sent" : "Forgot your password?"}
        subtitle={
          sentTo
            ? `If ${maskEmailAddress(sentTo)} exists in Relay, a reset link is on its way.`
            : "Enter your account email and we will send a reset link."
        }
      >
        {sentTo ? (
          <div className="auth-step-enter space-y-3">
            <p className="auth-inline-alert is-success" role="status">
              Open the latest email and use the reset link within one hour.
            </p>
            <div className="auth-note-strip">Did not receive it yet? Check spam and promotions, then request another link.</div>
            <button
              type="button"
              className="relay-cta-quiet w-full"
              onClick={() => {
                setSentTo(null);
                setError(null);
              }}
            >
              Send another link
            </button>
          </div>
        ) : (
          <form className="auth-step-enter space-y-4" onSubmit={sendReset} noValidate>
            {error ? (
              <p className="auth-inline-alert" role="alert">
                {error}
              </p>
            ) : null}

            <RelayField
              label="Account email"
              htmlFor="forgot-email"
              hint="Use the same email you sign in with."
              error={normalizedEmail.length > 0 && !emailValid ? "Enter a valid email address." : null}
            >
              <input
                id="forgot-email"
                className="auth-input"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </RelayField>

            <RelaySubmitButton idleLabel="Send reset link" busyLabel="Sending reset link" busy={busy} disabled={!emailValid} />
          </form>
        )}
      </RelayAuthSurface>

      <div className="mt-3 text-center text-sm text-[var(--graphite)]">
        Remembered your password?{" "}
        <Link href="/login" className="text-[var(--ink)] underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    </RelayAuthShell>
  );
}
