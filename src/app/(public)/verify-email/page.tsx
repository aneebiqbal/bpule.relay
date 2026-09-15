"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Mail, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RelayBrand } from "@/components/brand";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function VerifyEmailPage() {
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setResending(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setError("No email found. Please sign up again.");
        return;
      }
      const { error: err } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
      });
      if (err) throw err;
      setResent(true);
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <RelayBrand />
        <div className="mt-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-orange/10">
            <Mail className="size-6 text-orange" />
          </div>
          <h1 className="mt-4 text-display text-2xl text-ink">Check your email</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-graphite">
            We sent you a verification link. Click it to activate your account.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <Button
            variant="orange"
            className="w-full"
            onClick={resend}
            disabled={resending || cooldown > 0}
            loading={resending}
          >
            {cooldown > 0
              ? `Resend available in ${cooldown}s`
              : resent
                ? "Resend verification email"
                : "Resend verification email"}
          </Button>
          {resent && (
            <p className="text-center text-sm text-status-success">
              Verification email sent.
            </p>
          )}
          {error && (
            <p className="text-center text-sm text-status-danger" role="alert">
              {error}
            </p>
          )}
          <Link
            href="/login"
            className="flex items-center justify-center gap-1.5 text-sm text-graphite transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
