'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type TabKey = 'TO_SEND' | 'DRAFTS' | 'WAITING' | 'REPLIES' | 'FAILED'

interface WorkspaceState {
  tabs: Record<TabKey, Array<{
    id: string
    kind: 'draft' | 'message'
    leadId: string
    company: string
    contactName: string | null
    identityName: string
    status: string
    subject: string | null
    updatedAt: string
    blockedReason?: string | null
  }>>
  summary: Record<TabKey, number>
}

const TAB_ORDER: TabKey[] = ['TO_SEND', 'DRAFTS', 'WAITING', 'REPLIES', 'FAILED']

function tabLabel(tab: TabKey): string {
  switch (tab) {
    case 'TO_SEND':
      return 'TO SEND'
    case 'DRAFTS':
      return 'DRAFTS'
    case 'WAITING':
      return 'WAITING'
    case 'REPLIES':
      return 'REPLIES'
    case 'FAILED':
      return 'FAILED'
  }
}

export function RevenueEmailWorkspace() {
  const [activeTab, setActiveTab] = useState<TabKey>('TO_SEND')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<WorkspaceState>({
    tabs: { TO_SEND: [], DRAFTS: [], WAITING: [], REPLIES: [], FAILED: [] },
    summary: { TO_SEND: 0, DRAFTS: 0, WAITING: 0, REPLIES: 0, FAILED: 0 },
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/revenue/email')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load email workspace.')
        if (!cancelled) {
          setState(data as WorkspaceState)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load email workspace.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => state.tabs[activeTab] ?? [], [activeTab, state])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Revenue Email</h1>
          <p className="text-sm text-graphite">Execution queue for prepared outreach, replies, and delivery exceptions.</p>
        </div>
        <Link href="/leads">
          <Button variant="outline" size="sm">Open leads</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {TAB_ORDER.map((tab) => {
          const active = activeTab === tab
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={active
                ? 'rounded-md bg-solid px-3 py-1.5 text-xs font-medium text-on-solid'
                : 'rounded-md border border-line px-3 py-1.5 text-xs font-medium text-graphite hover:text-ink'}
            >
              {tabLabel(tab)} {state.summary[tab] ? `(${state.summary[tab]})` : ''}
            </button>
          )
        })}
      </div>

      {loading && <p className="text-sm text-graphite">Loading email queue...</p>}
      {error && <p className="text-sm text-status-danger">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-line bg-bone-raised p-8 text-center text-sm text-graphite">
          Nothing in {tabLabel(activeTab).toLowerCase()}.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={`${row.kind}:${row.id}`} className="rounded-lg border border-line bg-bone-raised p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{row.company}</p>
                  <p className="text-xs text-graphite">
                    {row.contactName ?? 'No contact'} · {row.identityName}
                  </p>
                  {row.subject && <p className="mt-1 text-xs text-ink">Subject: {row.subject}</p>}
                  {row.blockedReason && <p className="mt-1 text-xs text-status-warning">{row.blockedReason}</p>}
                </div>
                <span className="rounded bg-bone px-2 py-1 text-[10px] font-medium text-graphite">{row.status}</span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-stone">{new Date(row.updatedAt).toLocaleString()}</span>
                <Link href={`/leads/${row.leadId}`} className="text-xs font-medium text-cobalt hover:underline">Review Email</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
