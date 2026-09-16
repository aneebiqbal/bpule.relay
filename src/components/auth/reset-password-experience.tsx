"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { humanizePasswordResetError } from "@/lib/auth/error-messages";
import {
  RelayAuthShell,
  RelayAuthSurface,
  RelayField,
  RelaySubmitButton,
} from "@/components/auth/relay-auth-shell";

export function ResetPasswordExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const linkInvalid = useMemo(() => Boolean(searchParams.get("error")), [searchParams]);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passwordValid = password.length >= 8;

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordValid || busy) return;

    setBusy(true);
    setError(null);

    try {
      const supabase = getBrowserSupabase();
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      setDone(true);
    } catch (cause) {
      setError(humanizePasswordResetError(cause instanceof Error ? cause.message : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RelayAuthShell
      stateLabel="RELAY / RESET"
      heading="Set a new access key"
      subheading="Create a new password to continue into Relay with a secure, fresh session."
      contextLabel="Reset pathway"
      contextPoints={[
        { title: "One-time link", detail: "Your email link authorizes this reset session." },
        { title: "Replace", detail: "New password replaces the old one immediately." },
        { title: "Continue", detail: "Return to sign in and resume onboarding or queue work." },
      ]}
    >
      <RelayAuthSurface
        chapter="Password reset"
        title={linkInvalid ? "Reset link expired" : done ? "Password updated" : "Choose a new password"}
        subtitle={
          linkInvalid
            ? "Request a fresh reset link and open it in this browser."
            : done
              ? "Your password is now active for future sign-ins."
              : "Use at least 8 characters. Longer is safer."
        }
      >
        {linkInvalid ? (
          <div className="auth-step-enter space-y-3">
            <p className="auth-inline-alert" role="alert">
              This recovery link is no longer valid.
            </p>
            <Link href="/forgot-password" className="relay-cta auth-submit justify-between">
              <span className="relay-cta-pulse" aria-hidden="true" />
              <span>Request a fresh reset link</span>
              <span className="relay-cta-arrow" aria-hidden="true">
                -&gt;
              </span>
            </Link>
          </div>
        ) : done ? (
          <div className="auth-step-enter space-y-3">
            <p className="auth-inline-alert is-success" role="status">
              You can now sign in with your new password.
            </p>
            <button type="button" onClick={() => router.push("/login")} className="relay-cta auth-submit justify-between">
              <span className="relay-cta-pulse" aria-hidden="true" />
              <span>Continue to sign in</span>
              <span className="relay-cta-arrow" aria-hidden="true">
                -&gt;
              </span>
            </button>
          </div>
        ) : (
          <form className="auth-step-enter space-y-4" onSubmit={updatePassword} noValidate>
            {error ? (
              <p className="auth-inline-alert" role="alert">
                {error}
              </p>
            ) : null}

            <RelayField
              label="New password"
              htmlFor="reset-password"
              hint="Minimum 8 characters."
              error={password.length > 0 && !passwordValid ? `${8 - password.length} more characters needed.` : null}
            >
              <input
                id="reset-password"
                className="auth-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Set your new password"
              />
            </RelayField>

            <RelaySubmitButton idleLabel="Update password" busyLabel="Updating password" busy={busy} disabled={!passwordValid} />
          </form>
        )}
      </RelayAuthSurface>

      <div className="mt-3 text-center text-sm text-[var(--graphite)]">
        <Link href="/login" className="text-[var(--ink)] underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </div>
    </RelayAuthShell>
  );
}
