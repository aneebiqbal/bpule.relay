'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [entity, setEntity] = useState<'all' | 'lead' | 'proof' | 'upwork'>('all')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<
    Array<{
      entityType: string
      id: string
      title: string
      subtitle: string
      status: string | null
      createdAt: string
    }>
  >([])
  const [error, setError] = useState<string | null>(null)

  async function search() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('q', query)
      if (entity !== 'all') params.set('entity', entity)
      if (status) params.set('status', status)
      const res = await fetch(`/api/search?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed.')
      setResults(data.results ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">Archive</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate">
          Search across leads, proof items, and Upwork jobs. Filter by type, status, and more.
        </p>
      </header>

      <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row">
        <div className="flex-1">
          <Label htmlFor="query">Search</Label>
          <Input
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search()
            }}
            placeholder="company name, skill, quote..."
          />
        </div>
        <div>
          <Label htmlFor="entity">Type</Label>
          <Select id="entity" value={entity} onChange={(e) => setEntity(e.target.value as typeof entity)}>
            <option value="all">All</option>
            <option value="lead">Leads</option>
            <option value="proof">Proof</option>
            <option value="upwork">Upwork</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any</option>
            <option value="new">new</option>
            <option value="contacted">contacted</option>
            <option value="replied">replied</option>
            <option value="no">no</option>
            <option value="dead">dead</option>
          </Select>
        </div>
        <div className="flex items-end">
          <Button variant="gold" onClick={() => void search()} loading={loading}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-status-no">{error}</p>
      ) : null}

      {results.length > 0 ? (
        <section>
          <p className="mb-3 text-xs text-slate">{results.length} result(s)</p>
          <ul className="space-y-3">
            {results.map((r) => (
              <li key={r.entityType + r.id}>
                <Link
                  href={
                    r.entityType === 'lead'
                      ? `/leads/${r.id}`
                      : r.entityType === 'upwork'
                        ? `/upwork/${r.id}`
                        : '/profiles'
                  }
                  className="block rounded-lg border border-line p-4 transition-colors hover:bg-paper-tint/40"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{r.title}</span>
                    <span className="rounded-md bg-paper-tint px-2 py-0.5 font-mono text-[11px] uppercase text-slate">
                      {r.entityType}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate">{r.subtitle}</p>
                  {r.status ? (
                    <p className="mt-1 text-xs text-slate">Status: {r.status}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : query && !loading ? (
        <p className="text-sm text-slate">No results found.</p>
      ) : null}
    </div>
  )
}
