"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RelayBrand } from "@/components/brand";
import { getBrowserSupabase } from "@/lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailValid || busy) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = getBrowserSupabase();
      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );
      if (authError) throw new Error(authError.message);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12 gradient-mesh">
      <div className="absolute -top-32 right-1/4 size-64 rounded-full bg-orange/[0.06] blur-[80px]" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8">
          <Link href="/" className="inline-block">
            <RelayBrand />
          </Link>
        </div>

        {sent ? (
          <div className="space-y-6">
            <div className="flex size-12 items-center justify-center rounded-full bg-orange/10">
              <CheckCircle2 className="size-5 text-orange" />
            </div>
            <div className="space-y-2">
              <h1 className="text-heading text-2xl text-ink">Check your inbox.</h1>
              <p className="text-[15px] leading-relaxed text-graphite">
                We sent a password reset link to{" "}
                <span className="font-medium text-ink">
                  {email.trim().toLowerCase()}
                </span>
                . Open it to set a new password.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-ink transition-colors hover:bg-bone-raised"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-heading text-2xl text-ink">Forgot password?</h1>
              <p className="text-[15px] leading-relaxed text-graphite">
                Enter your email and we will send you a link to reset it.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-5 rounded-xl border border-line bg-bone-raised p-5"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>

              {error && (
                <p className="text-sm text-status-danger" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="orange"
                className="w-full"
                size="lg"
                disabled={!emailValid}
                loading={busy}
              >
                Send reset link
                {!busy && <Mail className="ml-1.5 size-4" />}
              </Button>
            </form>

            <div className="text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-[13px] text-graphite transition-colors hover:text-ink"
              >
                <ArrowLeft className="size-3.5" />
                Back to sign in
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
