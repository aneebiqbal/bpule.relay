import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { SupabaseSignIn } from '@/components/supabase-sign-in'
import { RelayBrand } from '@/components/brand'
import { getCurrentUser } from '@/lib/auth/current'
import { isDemoMode } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect('/')

  const demo = isDemoMode()

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <RelayBrand />
          <div className="space-y-2">
            <h1 className="text-2xl font-medium tracking-tight text-ink">
              {demo ? 'Demo build' : 'Welcome back'}
            </h1>
            <p className="text-sm leading-relaxed text-slate">
              {demo
                ? 'No Supabase is connected, so there is no real auth.'
                : 'Qualify leads, draft in your voice, and know what actually works.'}
            </p>
          </div>
        </div>

        {demo ? (
          <div className="space-y-4 rounded-2xl border border-line bg-paper p-6">
            <p className="text-sm leading-relaxed text-slate">
              This build runs on an in-memory store with a fixed demo rep (Hassan, admin). Onboarding
              calibrates a style card every draft is written in.
            </p>
            <Link
              href="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-gold/90"
            >
              Enter as Hassan (demo)
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-paper p-6">
            <SupabaseSignIn />
          </div>
        )}

        <p className="flex items-center justify-center gap-1.5 text-center text-xs leading-relaxed text-slate">
          <ShieldCheck className="size-3.5 shrink-0 text-status-send" aria-hidden="true" />
          Relay never sends a message for you. You copy, you paste, outcomes get scored from what
          really happened.
        </p>
      </div>
    </div>
  )
}
