'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Plus, X, Eye } from 'lucide-react'
import type { Fact } from '@/lib/domain/types'

export function FactsManager({
  initialFacts,
  isAdmin,
}: {
  initialFacts: Fact[]
  isAdmin: boolean
}) {
  const [facts, setFacts] = useState<Fact[]>(initialFacts)
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [factType, setFactType] = useState('credential')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim() || !value.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), value: value.trim(), factType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save fact.')
      setFacts((f) => [...f, data.fact].sort((a, b) => a.label.localeCompare(b.label)))
      setLabel('')
      setValue('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save fact.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/facts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to delete fact.')
      }
      setFacts((f) => f.filter((fact) => fact.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete fact.')
    } finally {
      setBusy(false)
    }
  }

  const factsByType = facts.reduce<Record<string, Fact[]>>((acc, f) => {
    const type = f.factType ?? 'uncategorized'
    if (!acc[type]) acc[type] = []
    acc[type].push(f)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!isAdmin ? (
        <div className="flex items-start gap-3 rounded-2xl border border-line/60 bg-bone/30 px-4 py-3">
          <Eye className="mt-0.5 size-4 shrink-0 text-slate" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ink">Read-only</p>
            <p className="text-xs text-slate">Facts are edited by admins only. Reps and sourcers can view them.</p>
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <section className="reveal-up rounded-2xl border border-line/60 bg-bg-bone-raised p-6">
          <div className="flex items-center gap-2">
            <Plus className="size-4 text-orange" aria-hidden="true" />
            <h2 className="text-heading text-base text-ink">Add a fact</h2>
          </div>
          <form onSubmit={save} className="mt-4 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="fact-label">Label</Label>
              <Input
                id="fact-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Years shipping"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fact-value">Value (exactly as a model may quote it)</Label>
              <Textarea
                id="fact-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={2}
                placeholder="e.g. first plan in 10 days"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fact-type">Type</Label>
              <Select id="fact-type" value={factType} onChange={(e) => setFactType(e.target.value)}>
                <option value="credential">credential</option>
                <option value="price">price</option>
                <option value="case">case</option>
                <option value="process">process</option>
                <option value="industry:saas">industry:...</option>
                <option value="play:...">play:...</option>
              </Select>
            </div>
            <div>
              <Button
                variant="orange"
                type="submit"
                disabled={busy || !label.trim() || !value.trim()}
                loading={busy}
              >
                Add fact
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="space-y-6">
        {facts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line py-10 text-center">
            <p className="text-sm text-slate">No facts yet.</p>
          </div>
        ) : (
          Object.entries(factsByType).map(([type, typeFacts]) => (
            <div key={type} className="reveal-up space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-label">{type}</Badge>
                <span className="text-mono-medium text-xs text-slate">{typeFacts.length}</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-line/60 bg-bg-bone-raised">
                <ul className="divide-y divide-line/50">
                  {typeFacts.map((f, i) => (
                    <li
                      key={f.id}
                      className="slide-in-right flex items-start justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-bone/20"
                      style={{ animationDelay: `${0.03 + i * 0.02}s` }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{f.label}</p>
                        <p className="mt-0.5 text-sm text-slate">{f.value}</p>
                      </div>
                      {isAdmin ? (
                        <button
                          onClick={() => remove(f.id)}
                          disabled={busy}
                          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate transition-colors hover:bg-status-danger/8 hover:text-status-danger disabled:opacity-50"
                          aria-label={`Delete ${f.label}`}
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : (
                        <Eye className="mt-1 size-3.5 shrink-0 text-line" aria-hidden="true" />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
