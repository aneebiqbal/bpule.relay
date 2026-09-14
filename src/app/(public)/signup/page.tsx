"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RelayBrand } from "@/components/brand";
import { cn } from "cn";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resent, setResent] = useState(false);
  const [resentCooldown, setResentCooldown] = useState(0);

  const emailValid = EMAIL_RE.test(email.trim());
  const passwordValid = password.length >= 8;
  const orgValid = orgName.trim().length >= 2;
  const canSubmit = orgValid && emailValid && passwordValid && !busy;

  async function signup(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName: orgName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Signup failed.");
      setConfirmationSent(true);
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
      setBusy(false);
    }
  }

  async function resendEmail() {
    if (resentCooldown > 0) return;
    setResent(true);
    setResentCooldown(60);
    await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgName: orgName.trim(),
        email: email.trim().toLowerCase(),
        password,
      }),
    }).catch(() => {});
    const interval = setInterval(() => {
      setResentCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  return (
    <div className="flex min-h-dvh">
      {/* Left panel — brand signal */}
      <div className="hidden lg:flex lg:w-[42%] xl:w-[38%]">
        <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-ink p-10 xl:p-12">
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
            aria-hidden="true"
          >
            <line
              x1="0"
              y1="0"
              x2="100%"
              y2="100%"
              stroke="var(--orange)"
              strokeWidth="1"
              strokeDasharray="4 8"
            />
          </svg>

          <div className="relative">
            <Link href="/" className="inline-block">
              <RelayBrand light />
            </Link>
          </div>

          <div className="relative space-y-8">
            <div className="space-y-4">
              <p
                className="text-label tracking-[0.14em]"
                style={{ color: "var(--orange)" }}
              >
                RELAY / YOUR NEXT MOVE
              </p>
              <h2 className="text-display text-3xl text-bone xl:text-4xl">
                Know what to do next.
              </h2>
              <p className="max-w-sm text-[15px] leading-relaxed text-bone/50">
                Relay finds the opportunities worth your attention, helps you reach
                the right people, and turns your expertise into authority.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { label: "Find signal in the noise", meta: "From opportunity to action" },
                { label: "Write in your actual voice", meta: "Not a template" },
                { label: "Build authority consistently", meta: "Studio is included" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-orange" />
                  <div>
                    <p className="text-[13px] font-medium text-bone">{item.label}</p>
                    <p className="text-[11px] text-bone/40">{item.meta}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="relative text-mono-regular text-[11px] text-bone/25">
            Free to start. No card required.
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10 gradient-mesh">
        <div className="absolute -top-32 right-1/4 size-64 rounded-full bg-orange/[0.06] blur-[80px]" />

        <div className="relative w-full max-w-sm">
          <div className="lg:hidden">
            <Link href="/" className="inline-block">
              <RelayBrand />
            </Link>
          </div>

          {confirmationSent ? (
            <div className="space-y-6">
              <div className="flex size-12 items-center justify-center rounded-full bg-orange/10">
                <Mail className="size-5 text-orange" />
              </div>

              <div className="space-y-2">
                <h1 className="text-heading text-3xl text-ink">Check your inbox.</h1>
                <p className="text-[15px] leading-relaxed text-graphite">
                  We sent a confirmation link to{" "}
                  <span className="font-medium text-ink">
                    {email.trim().toLowerCase()}
                  </span>
                  . Click it to activate your account, then sign in.
                </p>
              </div>

              <div className="rounded-xl border border-line bg-bone-raised p-5 space-y-4">
                <p className="text-[14px] text-graphite">
                  Did not get it? Check your spam folder.
                </p>

                <Button
                  variant="outline"
                  onClick={resendEmail}
                  disabled={resentCooldown > 0}
                  className="w-full"
                >
                  <RefreshCw className="mr-2 size-4" />
                  {resentCooldown > 0
                    ? `Resend in ${resentCooldown}s`
                    : resent
                      ? "Link resent"
                      : "Resend email"}
                </Button>

                <div className="flex flex-col gap-2 text-center">
                  <Link
                    href="/login"
                    className="text-[13px] font-medium text-orange underline-offset-4 hover:underline"
                  >
                    Go to sign in
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmationSent(false);
                      setResent(false);
                    }}
                    className="text-[13px] text-graphite underline-offset-4 hover:underline"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <h1 className="text-heading text-3xl text-ink">Create your Relay</h1>
                <p className="text-[15px] leading-relaxed text-graphite">
                  Set up your workspace. You will be the first admin — add team
                  members later.
                </p>
              </div>

              <form
                onSubmit={signup}
                className="space-y-5 rounded-xl border border-line bg-bone-raised p-5"
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="org-name">Organization name</Label>
                  <Input
                    id="org-name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g. Acme Delivery Co."
                    className={cn(
                      orgName.trim().length > 0 &&
                        !orgValid &&
                        "border-status-danger",
                    )}
                  />
                  {!orgValid && orgName.trim().length > 0 && (
                    <p className="text-xs text-status-danger">
                      At least 2 characters.
                    </p>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="signup-email">Work email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className={cn(
                      email.trim().length > 0 &&
                        !emailValid &&
                        "border-status-danger",
                    )}
                  />
                  {email.trim().length > 0 && !emailValid && (
                    <p className="text-xs text-status-danger">Enter a valid email.</p>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={cn(
                      password.length > 0 &&
                        !passwordValid &&
                        "border-status-danger",
                    )}
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
                  disabled={!canSubmit}
                  loading={busy}
                >
                  Create free account
                  {!busy && <ArrowRight className="ml-1.5 size-4" />}
                </Button>
              </form>

              <p className="text-center text-[13px] text-graphite">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-orange underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
              </p>

              <p className="text-center text-mono-regular text-[11px] text-stone">
                By creating an account you agree to our{" "}
                <Link href="/terms" className="underline-offset-2 hover:underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline-offset-2 hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
