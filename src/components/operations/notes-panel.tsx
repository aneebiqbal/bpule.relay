'use client'

import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import type { InternalNote, NoteSubjectType } from '@/lib/operations/notes'

function stamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * Internal notes for one subject. Visually distinct from client messages
 * (lock icon, "Internal" label, dashed surface) and never rendered inside a
 * thread. Loaded on demand so list pages never pay for note bodies.
 */
export function NotesPanel({
  subjectType,
  subjectId,
  title = 'Internal notes',
}: {
  subjectType: NoteSubjectType
  subjectId: string
  title?: string
}) {
  const [notes, setNotes] = useState<InternalNote[] | null>(null)
  const [available, setAvailable] = useState(true)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Outside the viewer's scope the panel is simply absent, not an error.
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/notes?subjectType=${subjectType}&subjectId=${encodeURIComponent(subjectId)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.status === 403) {
          setHidden(true)
          return
        }
        if (!res.ok) {
          setError(json.error || 'Notes could not be loaded')
          setNotes([])
          return
        }
        setNotes(json.notes ?? [])
        setAvailable(json.available !== false)
      })
      .catch(() => !cancelled && setNotes([]))
    return () => {
      cancelled = true
    }
  }, [subjectType, subjectId])

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectType, subjectId, body: draft }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not save note')
      setNotes((prev) => [json.note, ...(prev ?? [])])
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editing) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/notes/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editing.body }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not edit note')
      setNotes((prev) => (prev ?? []).map((n) => (n.id === editing.id ? json.note : n)))
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not edit note')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this note? It stays in the audit log.')) return
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    if (res.ok) setNotes((prev) => (prev ?? []).filter((n) => n.id !== id))
    else setError('Could not delete note')
  }

  if (hidden) return null

  return (
    <section aria-labelledby={`notes-${subjectId}`} className="rounded-lg border border-dashed border-line bg-bone p-3">
      <div className="flex items-center gap-1.5">
        <Lock className="size-3.5 text-stone" aria-hidden="true" />
        <h2 id={`notes-${subjectId}`} className="text-[13px] font-medium text-ink">
          {title}
        </h2>
        <span className="text-[11px] text-stone">Internal · not visible to the client</span>
      </div>

      {!available ? (
        <p className="mt-2 text-[12px] text-graphite">This feature is unavailable right now.</p>
      ) : (
        <>
          <form onSubmit={add} className="mt-2 space-y-1.5">
            <label className="block">
              <span className="sr-only">New internal note</span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={4000}
                placeholder="Add an internal note…"
                className="w-full resize-y rounded-md border border-line bg-bone-raised px-2.5 py-2 text-[13px] text-ink outline-none focus-visible:border-orange/40"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="h-7 rounded-md bg-solid px-2.5 text-[12px] font-medium text-on-solid disabled:opacity-50"
              >
                Add note
              </button>
            </div>
          </form>
          {error && (
            <p role="alert" className="mt-1 text-[12px] text-status-danger">
              {error}
            </p>
          )}
          <ul className="mt-2 space-y-2" aria-label="Notes, newest first">
            {notes === null && <li className="text-[12px] text-stone">Loading notes…</li>}
            {notes?.length === 0 && <li className="text-[12px] text-stone">No notes yet.</li>}
            {notes?.map((note) => (
              <li key={note.id} className="rounded-md border border-line/70 bg-bone-raised px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2 text-[11px] text-stone">
                  <span>
                    <span className="font-medium text-graphite">{note.authorName ?? 'Unknown'}</span>
                    {' · '}
                    <time dateTime={note.createdAt}>{stamp(note.createdAt)}</time>
                    {note.editedAt && ' · edited'}
                  </span>
                  <span className="flex gap-2">
                    {note.canEdit && editing?.id !== note.id && (
                      <button type="button" className="hover:text-ink" onClick={() => setEditing({ id: note.id, body: note.body })}>
                        Edit
                      </button>
                    )}
                    {note.canDelete && (
                      <button type="button" className="hover:text-status-danger" onClick={() => remove(note.id)}>
                        Delete
                      </button>
                    )}
                  </span>
                </div>
                {editing?.id === note.id ? (
                  <div className="mt-1 space-y-1">
                    <label className="block">
                      <span className="sr-only">Edit note</span>
                      <textarea
                        value={editing.body}
                        onChange={(e) => setEditing({ id: note.id, body: e.target.value })}
                        rows={3}
                        maxLength={4000}
                        className="w-full rounded-md border border-line bg-bone px-2 py-1.5 text-[13px] text-ink"
                      />
                    </label>
                    <div className="flex justify-end gap-2 text-[12px]">
                      <button type="button" onClick={() => setEditing(null)} className="text-graphite hover:text-ink">
                        Cancel
                      </button>
                      <button type="button" disabled={busy} onClick={saveEdit} className="font-medium text-ink">
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{note.body}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
