import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, ShieldCheck, Zap, Users, BarChart3, Sparkles } from 'lucide-react'
import { SupabaseSignIn } from '@/components/supabase-sign-in'
import { RelayBrand } from '@/components/brand'
import { getCurrentUser } from '@/lib/auth/current'
import { isDemoMode } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'

const FEATURES = [
  { icon: Zap, label: 'AI extraction & scoring', desc: 'Paste research, get a full breakdown in seconds' },
  { icon: Users, label: 'Voice-calibrated drafts', desc: 'Every message sounds like you, not a template' },
  { icon: BarChart3, label: 'Outcome analytics', desc: 'Reply rates, costs, team metrics — all real' },
] as const

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect('/')

  const demo = isDemoMode()

  return (
    <div className="flex min-h-dvh">
      {/* Left panel — brand story */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%]">
        <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-ink p-10 xl:p-12">
          {/* Subtle signal line */}
          <svg className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.06]" aria-hidden="true">
            <line x1="0" y1="0" x2="100%" y2="100%" stroke="var(--orange)" strokeWidth="1" strokeDasharray="4 8" />
          </svg>

          <div className="relative">
            <RelayBrand />
          </div>

          <div className="relative space-y-10">
            <div className="space-y-4">
              <h2 className="text-display text-3xl text-bone xl:text-4xl">
                Know who&apos;s worth<br />your next message.
              </h2>
              <p className="max-w-sm text-[15px] leading-relaxed text-bone/50">
                Relay scores every lead on a transparent rubric, drafts in your voice,
                and tracks what actually works — so you stop guessing.
              </p>
            </div>

            <div className="space-y-5">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-4 group">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange/10">
                    <Icon className="size-[16px] text-orange" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-bone">{label}</p>
                    <p className="text-[12px] text-bone/40">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="relative text-mono-regular text-[11px] text-bone/25">
            v0.7.0 · Built for reps who hate spray-and-pray
          </p>
        </div>
      </div>

      {/* Right panel — auth */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="relative w-full max-w-sm space-y-6">
          <div className="lg:hidden"><RelayBrand /></div>

          <div className="space-y-2">
            <h1 className="text-heading text-2xl text-ink">
              {demo ? 'Demo build' : 'Welcome back'}
            </h1>
            <p className="text-[14px] leading-relaxed text-graphite">
              {demo
                ? 'No Supabase is connected — this runs on an in-memory store.'
                : 'Qualify leads, draft in your voice, and know what actually works.'}
            </p>
          </div>

          {demo ? (
            <div className="space-y-4 rounded-lg border border-line bg-bone-raised p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-orange/10">
                  <Sparkles className="size-4 text-orange" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-ink">Demo mode active</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-graphite">
                    Onboarding calibrates a style card every draft is written in. Explore with full admin access.
                  </p>
                </div>
              </div>
              <Link
                href="/"
                className="group flex w-full items-center justify-center gap-2 rounded-lg bg-orange px-4 py-2.5 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark active:scale-[0.97]"
              >
                Enter as Hassan (demo)
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-bone-raised p-5">
              <SupabaseSignIn />
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-bone px-4 py-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden="true" />
            <p className="text-[12px] leading-relaxed text-graphite">
              Relay never sends a message for you. You copy, you paste, outcomes get scored from what really happened.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
