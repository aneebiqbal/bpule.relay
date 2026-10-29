'use client'

import { useRef, useState } from 'react'
import { UserPlus } from 'lucide-react'

const ROLES = [
  { value: 'MEMBER', label: 'Member' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'OWNER', label: 'Owner' },
] as const

/**
 * Invite one person into this workspace. Relay is invite-only, so this is the
 * only path that creates an account; the server writes the org + role into
 * admin-only metadata and the callback provisions the rep.
 */
export function InvitePersonDialog({ isOwner }: { isOwner: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('MEMBER')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invited, setInvited] = useState<string | null>(null)

  const open = () => {
    setError(null)
    setInvited(null)
    dialog.current?.showModal()
  }

  const close = () => dialog.current?.close()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not send the invitation.')
      setInvited(data.email ?? email.trim())
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invitation.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex items-center gap-1.5 rounded bg-orange px-3 py-1.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-orange-dark"
      >
        <UserPlus className="size-3.5" aria-hidden="true" />
        Add person
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="invite-title"
        className="w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-line bg-bone p-0 text-ink backdrop:bg-black/40"
        onClose={() => { setError(null); setInvited(null) }}
      >
        <form onSubmit={submit} className="space-y-4 p-5">
          <div>
            <h2 id="invite-title" className="text-[16px] font-medium">Invite a person</h2>
            <p className="mt-1 text-[12px] text-graphite">
              They receive an email invitation. Relay creates their account, organisation and role when they accept.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="invite-email" className="text-[12px] font-medium">Email</label>
            <input
              id="invite-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 w-full rounded border border-line bg-canvas px-2.5 text-[13px] outline-none focus:border-orange"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="invite-role" className="text-[12px] font-medium">Role</label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-9 w-full rounded border border-line bg-canvas px-2.5 text-[13px] outline-none focus:border-orange"
            >
              {ROLES.filter((r) => r.value !== 'OWNER' || isOwner).map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {error && <p role="alert" className="text-[12px] text-status-danger">{error}</p>}
          {invited && <p role="status" className="text-[12px] text-status-success">Invitation sent to {invited}.</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="h-8 rounded border border-line px-3 text-[12px] text-graphite hover:text-ink">
              {invited ? 'Done' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="h-8 rounded bg-orange px-3 text-[12px] font-medium text-on-accent disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
