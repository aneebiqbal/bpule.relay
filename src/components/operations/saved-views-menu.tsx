'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Bookmark, Trash2 } from 'lucide-react'
import { cn } from 'cn'
import type { SavedView, SavedViewSurface } from '@/lib/operations/saved-views'

/**
 * Saved views for one surface. Saving stores the current query string; opening
 * a view is plain navigation, so server scope still decides what is visible.
 */
export function SavedViewsMenu({ surface }: { surface: SavedViewSurface }) {
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [views, setViews] = useState<SavedView[] | null>(null)
  const [available, setAvailable] = useState(true)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || views !== null) return
    let cancelled = false
    fetch(`/api/saved-views?surface=${encodeURIComponent(surface)}`)
      .then((res) => res.json())
      .then((json: { views?: SavedView[]; available?: boolean }) => {
        if (cancelled) return
        setViews(json.views ?? [])
        setAvailable(json.available !== false)
      })
      .catch(() => !cancelled && setViews([]))
    return () => {
      cancelled = true
    }
  }, [open, views, surface])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface, name, query: searchParams.toString() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not save view')
      setViews((prev) => [...(prev ?? []).filter((v) => v.name !== json.view.name), json.view].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save view')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/saved-views/${id}`, { method: 'DELETE' })
    if (res.ok) setViews((prev) => (prev ?? []).filter((v) => v.id !== id))
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink hover:bg-bone-raised"
      >
        <Bookmark className="size-3.5" aria-hidden="true" />
        Views
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-line bg-bone-raised p-2 shadow-lg">
          {!available ? (
            <p className="px-1 py-2 text-[12px] text-graphite">This feature is unavailable right now.</p>
          ) : (
            <>
              <ul aria-label="Saved views" className="max-h-60 space-y-0.5 overflow-y-auto">
                {views === null && <li className="px-2 py-1.5 text-[12px] text-stone">Loading…</li>}
                {views?.length === 0 && <li className="px-2 py-1.5 text-[12px] text-stone">No saved views yet.</li>}
                {views?.map((view) => (
                  <li key={view.id} className="group flex items-center gap-1">
                    <Link
                      href={view.href}
                      onClick={() => setOpen(false)}
                      className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-[13px] text-ink hover:bg-bone"
                    >
                      {view.name}
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(view.id)}
                      aria-label={`Delete view ${view.name}`}
                      className="rounded-md p-1 text-stone hover:bg-bone hover:text-status-danger"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <form onSubmit={save} className="mt-2 flex gap-1 border-t border-line pt-2">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">View name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    placeholder="Save current filters as…"
                    className="h-8 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink outline-none focus-visible:border-orange/40"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className={cn('h-8 rounded-md bg-solid px-2.5 text-[12px] font-medium text-on-solid', (busy || !name.trim()) && 'opacity-50')}
                >
                  Save
                </button>
              </form>
              {error && (
                <p role="alert" className="mt-1 px-1 text-[12px] text-status-danger">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
