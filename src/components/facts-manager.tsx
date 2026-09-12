'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!isAdmin ? (
        <Alert>
          <AlertTitle>Read only for your role</AlertTitle>
          <AlertDescription>
            Facts are edited by admins only. Reps and sourcers can view them.
          </AlertDescription>
        </Alert>
      ) : null}

      {isAdmin ? (
        <section className="rounded-2xl border border-line bg-paper p-6">
          <h2 className="text-base font-medium text-ink">Add a fact</h2>
          <form onSubmit={save} className="mt-4 grid gap-3">
            <div className="grid gap-1.5">
              <Label>Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Years shipping"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Value (exactly as a model may quote it)</Label>
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={2}
                placeholder="e.g. first plan in 10 days"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={factType} onChange={(e) => setFactType(e.target.value)}>
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
                variant="gold"
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

      <div className="overflow-hidden rounded-2xl border border-line bg-paper">
        {facts.length === 0 ? (
          <p className="p-6 text-sm text-slate">No facts yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {facts.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{f.label}</span>
                    {f.factType ? <Badge variant="outline">{f.factType}</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-slate">{f.value}</p>
                </div>
                {isAdmin ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => remove(f.id)}
                    disabled={busy}
                  >
                    Delete
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}