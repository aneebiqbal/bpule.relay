'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function ImportPage() {
  const [csv, setCsv] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    duplicates: number
    invalid: number
    total: number
    results: Array<{ row: number; status: string; reason?: string; leadId?: string }>
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload() {
    if (!csv.trim()) {
      setError('Paste CSV content first.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, fileName: 'paste.csv' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed.')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">Bulk import</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate">
          Paste a CSV with columns: company, contactName, contactTitle, url, signalType,
          signalEvidence, verbatimQuote, tags. Every row is validated and deduped before import.
        </p>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-2xl border border-line bg-paper p-6">
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={`company,contactName,contactTitle,url,signalType,signalEvidence,verbatimQuote,tags
Acme Corp,Jane Doe,CTO,https://example.com/acme,1,Hiring 3 senior engineers,We need help shipping faster,"react,node"
Beta Inc,John Smith,CEO,,3,Raised a $2M seed round,Looking for a delivery partner,"python,django"`}
          rows={12}
          className="font-mono text-[13px]"
        />
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-slate">
            Required: company, signalType (1-7), signalEvidence.
          </span>
          <Button variant="gold" onClick={() => void upload()} loading={loading}>
            {loading ? 'Importing...' : 'Import rows'}
          </Button>
        </div>
      </section>

      {result ? (
        <section className="rounded-2xl border border-line bg-paper p-6">
          <div className="flex items-baseline gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate">Imported</div>
              <div className="mt-1 font-mono text-2xl text-status-send">{result.imported}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate">Duplicates</div>
              <div className="mt-1 font-mono text-2xl text-status-research">{result.duplicates}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate">Invalid</div>
              <div className="mt-1 font-mono text-2xl text-status-no">{result.invalid}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate">Total rows</div>
              <div className="mt-1 font-mono text-2xl text-ink">{result.total}</div>
            </div>
          </div>

          {result.results.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-slate">
                    <th className="pb-2 pr-4 font-medium">Row</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.row} className="border-b border-line/50">
                      <td className="py-2 pr-4 font-mono text-xs text-ink">{r.row}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                            r.status === 'imported'
                              ? 'bg-status-send/10 text-status-send'
                              : r.status === 'duplicate'
                                ? 'bg-status-research/10 text-status-research'
                                : 'bg-status-no/10 text-status-no'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-slate">
                        {r.reason ?? (r.leadId ? `Lead ${r.leadId}` : '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
