'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getBrowserSupabase } from '@/lib/supabase/client'
import { Mail, ArrowRight } from 'lucide-react'

type Mode = 'magic' | 'password'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SupabaseSignIn() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function validateEmail(next: string) {
    if (!next.trim()) setEmailError('Enter your work email.')
    else if (!EMAIL_RE.test(next)) setEmailError('That does not look like an email.')
    else setEmailError(null)
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    validateEmail(email)
    if (!EMAIL_RE.test(email.trim())) return
    setBusy(true)
    try {
      const supabase = getBrowserSupabase()
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo:
            typeof window !== 'undefined'
              ? `${window.location.origin}/auth/callback`
              : undefined,
        },
      })
      if (authError) throw new Error(authError.message)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link.')
    } finally {
      setBusy(false)
    }
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    validateEmail(email)
    if (!EMAIL_RE.test(email.trim())) return
    if (!password) {
      setError('Enter your password.')
      return
    }
    setBusy(true)
    try {
      const supabase = getBrowserSupabase()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (authError) throw new Error(authError.message)
      router.replace('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>
            We sent a sign-in link to {email.trim()}. Open it in this browser and
            you are in. No password needed for the magic link flow.
          </AlertDescription>
        </Alert>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-sm text-orange underline-offset-4 hover:underline"
        >
          Use a password instead
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={mode === 'magic' ? sendMagicLink : signIn}
      className="space-y-5"
      noValidate
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Sign in failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          error={Boolean(emailError)}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (emailError) validateEmail(e.target.value)
          }}
          onBlur={() => validateEmail(email)}
          aria-describedby={emailError ? 'email-error' : undefined}
          placeholder="you@company.com"
        />
        {emailError ? (
          <p id="email-error" className="text-xs text-status-danger" role="alert">
            {emailError}
          </p>
        ) : null}
      </div>

      {mode === 'password' ? (
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
      ) : null}

      {mode === 'magic' ? (
        <>
          <Button type="submit" variant="orange" className="w-full" size="lg" loading={busy}>
            {busy ? 'Sending the link' : 'Email me a link'}
            {!busy && <Mail className="ml-1.5 size-4" />}
          </Button>
          <p className="text-center text-xs text-slate">
            Small team, trusted group. No password needed.
          </p>
          <button
            type="button"
            onClick={() => setMode('password')}
            className="w-full text-center text-sm text-orange underline-offset-4 hover:underline"
          >
            Sign in with a password instead
          </button>
        </>
      ) : (
        <>
          <Button type="submit" variant="orange" className="w-full" size="lg" loading={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
            {!busy && <ArrowRight className="ml-1.5 size-4" />}
          </Button>
          <button
            type="button"
            onClick={() => setMode('magic')}
            className="w-full text-center text-sm text-orange underline-offset-4 hover:underline"
          >
            Back to the magic link
          </button>
        </>
      )}
    </form>
  )
}
