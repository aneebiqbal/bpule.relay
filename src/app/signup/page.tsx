'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Sparkles, Users, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getBrowserSupabase } from '@/lib/supabase/client'
import { cn } from 'cn'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignupPage() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emailValid = EMAIL_RE.test(email.trim())
  const passwordValid = password.length >= 8
  const orgValid = orgName.trim().length >= 2
  const canSubmit = orgValid && emailValid && passwordValid && !busy

  async function signup(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgName: orgName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Signup failed.')
      // Auto-sign-in then go straight into onboarding — no blank login screen.
      const supabase = getBrowserSupabase()
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signInErr) {
        // Fall back to login screen if auto-sign-in fails for any reason.
        router.push('/login?signedUp=1')
        return
      }
      router.push('/onboarding?new=1')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%]">
        <div className="relative flex flex-1 flex-col justify-between overflow-hidden bg-ink p-10 xl:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-orange/[0.08] blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-orange/[0.04] blur-[80px]" />

          <div className="relative">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-orange">
                <span className="font-mono text-sm font-bold text-ink">R</span>
              </span>
              <span className="text-lg font-semibold tracking-tight text-bone">Relay</span>
            </Link>
          </div>

          <div className="relative space-y-10">
            <div className="space-y-4">
              <h2 className="text-display text-3xl text-bone xl:text-4xl">
                Get your team<br />off spray-and-pray.
              </h2>
              <p className="max-w-sm text-[15px] leading-relaxed text-bone/50">
                Paste a few real past posts during onboarding and Relay calibrates
                to your voice. Every draft sounds like you, not a template.
              </p>
            </div>

            <div className="space-y-5">
              {[
                { icon: Zap, label: 'AI extraction & scoring', desc: 'Paste research, get a full breakdown in seconds' },
                { icon: Users, label: 'Voice-calibrated drafts', desc: 'Every message sounds like you, not a template' },
                { icon: Sparkles, label: 'Built for small teams', desc: 'One organization, multiple reps, shared voice' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange/10">
                    <Icon className="size-[18px] text-orange" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-bone">{label}</p>
                    <p className="text-[13px] text-bone/40">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="relative font-mono text-[11px] text-bone/25">
            v0.7.0 · Built for reps who hate spray-and-pray
          </p>
        </div>
      </div>

      {/* Right panel — signup form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10 gradient-mesh">
        <div className="absolute -top-32 right-1/4 size-64 rounded-full bg-orange/[0.06] blur-[80px]" />

        <div className="relative w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-orange">
                <span className="font-mono text-sm font-bold text-ink">R</span>
              </span>
              <span className="text-lg font-semibold tracking-tight text-ink">Relay</span>
            </Link>
          </div>

          <div className="space-y-2">
            <h1 className="text-heading text-3xl text-ink">Create your organization</h1>
            <p className="text-[15px] leading-relaxed text-slate">
              Set up your team workspace. You will be the first admin — add reps later from the dashboard.
            </p>
          </div>

          <form onSubmit={signup} className="space-y-5 rounded-2xl border border-line/60 bg-bg-bone-raised p-6">
            <div className="grid gap-1.5">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Acme Delivery Co."
                className={cn(orgName.trim().length > 0 && !orgValid && 'border-status-danger')}
              />
              {!orgValid && orgName.trim().length > 0 && (
                <p className="text-xs text-status-danger">At least 2 characters.</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="signup-email">Admin email</Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourcompany.com"
                className={cn(email.trim().length > 0 && !emailValid && 'border-status-danger')}
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className={cn(password.length > 0 && !passwordValid && 'border-status-danger')}
              />
              {password.length > 0 && !passwordValid && (
                <p className="text-xs text-status-danger">{8 -password.length} more characters needed.</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-status-danger" role="alert">{error}</p>
            )}

            <Button type="submit" disabled={!canSubmit} className="w-full">
              {busy ? 'Creating...' : <>Create account <ArrowRight className="size-4" /></>}
            </Button>
          </form>

          <p className="text-center text-sm text-slate">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-orange hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
