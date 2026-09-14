"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RelayBrand } from "@/components/brand";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Status = "loading" | "invalid" | "ready" | "success" | "error";

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordValid = password.length >= 8;

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setStatus("invalid");
      return;
    }
    setStatus("ready");
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordValid || busy) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = getBrowserSupabase();
      const { error: authError } = await supabase.auth.updateUser({
        password,
      });
      if (authError) throw new Error(authError.message);
      setStatus("success");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update password.",
      );
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="text-center">
          <div className="mx-auto size-5 animate-spin rounded-full border-2 border-line border-t-orange" />
          <p className="mt-4 text-[13px] text-graphite">
            Verifying your reset link...
          </p>
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 gradient-mesh">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <Link href="/" className="inline-block">
              <RelayBrand />
            </Link>
          </div>
          <div className="space-y-6">
            <div className="flex size-12 items-center justify-center rounded-full bg-status-danger/10">
              <XCircle className="size-5 text-status-danger" />
            </div>
            <div className="space-y-2">
              <h1 className="text-heading text-2xl text-ink">
                This link has expired.
              </h1>
              <p className="text-[15px] leading-relaxed text-graphite">
                Password reset links are valid for one hour. Request a new one
                and try again.
              </p>
            </div>
            <Link
              href="/forgot-password"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-orange px-4 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark"
            >
              Get a new link
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 gradient-mesh">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <Link href="/" className="inline-block">
              <RelayBrand />
            </Link>
          </div>
          <div className="space-y-6">
            <div className="flex size-12 items-center justify-center rounded-full bg-status-success/10">
              <CheckCircle2 className="size-5 text-status-success" />
            </div>
            <div className="space-y-2">
              <h1 className="text-heading text-2xl text-ink">
                Password updated.
              </h1>
              <p className="text-[15px] leading-relaxed text-graphite">
                Your new password is set. Sign in with it now.
              </p>
            </div>
            <Button
              variant="orange"
              className="w-full"
              size="lg"
              onClick={() => router.push("/login")}
            >
              Sign in
              <ArrowRight className="ml-1.5 size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Ready or error state
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12 gradient-mesh">
      <div className="absolute -top-32 right-1/4 size-64 rounded-full bg-orange/[0.06] blur-[80px]" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8">
          <Link href="/" className="inline-block">
            <RelayBrand />
          </Link>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-heading text-2xl text-ink">Set a new password.</h1>
            <p className="text-[15px] leading-relaxed text-graphite">
              Choose a new password. At least 8 characters.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-xl border border-line bg-bone-raised p-5"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              {password.length > 0 && !passwordValid && (
                <p className="text-xs text-status-danger">
                  {8 - password.length} more characters needed.
                </p>
              )}
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
              disabled={!passwordValid}
              loading={busy}
            >
              Update password
              {!busy && <ArrowRight className="ml-1.5 size-4" />}
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
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto size-5 animate-spin rounded-full border-2 border-line border-t-orange" />
            <p className="mt-4 text-[13px] text-graphite">Loading...</p>
          </div>
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
