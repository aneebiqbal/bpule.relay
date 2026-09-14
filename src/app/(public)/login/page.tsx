import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { SupabaseSignIn } from "@/components/supabase-sign-in";
import { RelayBrand } from "@/components/brand";
import { getCurrentUser } from "@/lib/auth/current";
import { isDemoMode } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const demo = isDemoMode();

  return (
    <div className="flex min-h-dvh">
      {/* Left panel — brand */}
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

          <div className="relative space-y-6">
            <p
              className="text-label tracking-[0.14em]"
              style={{ color: "var(--orange)" }}
            >
              RELAY / YOUR NEXT MOVE
            </p>
            <h2 className="text-display text-3xl text-bone xl:text-4xl">
              Welcome back.
            </h2>
            <p className="max-w-sm text-[15px] leading-relaxed text-bone/50">
              Your queue is waiting. Sign in to pick up where you left off.
            </p>
          </div>

          <p className="relative text-mono-regular text-[11px] text-bone/25">
            Built for people with too much signal and too little time.
          </p>
        </div>
      </div>

      {/* Right panel — auth */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10 gradient-mesh">
        <div className="absolute -top-32 right-1/4 size-64 rounded-full bg-orange/[0.06] blur-[80px]" />

        <div className="relative w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <Link href="/" className="inline-block">
              <RelayBrand />
            </Link>
          </div>

          <div className="space-y-2">
            <h1 className="text-heading text-3xl text-ink">Welcome back.</h1>
            <p className="text-[15px] leading-relaxed text-graphite">
              {demo
                ? "No Supabase connected — this runs on an in-memory store."
                : "Sign in to continue where you left off."}
            </p>
          </div>

          {demo ? (
            <div className="mt-6 space-y-4 rounded-xl border border-line bg-bone-raised p-5">
              <p className="text-[14px] text-graphite">
                Demo build active. Explore with full admin access.
              </p>
              <Link
                href="/"
                className="group flex w-full items-center justify-center gap-2 rounded-lg bg-orange px-4 py-2.5 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark active:scale-[0.97]"
              >
                Enter demo
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-line bg-bone-raised p-5">
              <SupabaseSignIn />
            </div>
          )}

          {!demo && (
            <div className="mt-6 space-y-3 text-center">
              <Link
                href="/forgot-password"
                className="text-[13px] text-graphite underline-offset-4 hover:text-ink hover:underline"
              >
                Forgot your password?
              </Link>
              <p className="text-[13px] text-graphite">
                Do not have an account?{" "}
                <Link
                  href="/signup"
                  className="font-medium text-orange underline-offset-4 hover:underline"
                >
                  Create one free
                </Link>
              </p>
            </div>
          )}

          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-[13px] text-graphite transition-colors hover:text-ink"
            >
              <ArrowLeft className="size-3.5" />
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
