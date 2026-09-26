'use client'

import { useState } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Pencil, Check } from 'lucide-react'
import type { RelationshipPhase } from '@/lib/relay/relationship-state'

type PhaseFilter = RelationshipPhase | '*'

interface LogRelationshipUpdateProps {
  leadId: string
  phase: RelationshipPhase
  onLogged?: () => void
  onCancel?: () => void
}

const UPDATE_OPTIONS: Array<{ phase: PhaseFilter[]; label: string; value: string }> = [
  { phase: ['connection_sent', 'connection_due', 'connection_accepted'], label: 'They accepted my connection', value: 'connection_accepted' },
  { phase: ['dm_sent', 'waiting_for_reply', 'replied', 'follow_up_due', 'conversation'], label: 'They replied', value: 'client_replied' },
  { phase: ['connection_due', 'connection_sent', 'connection_accepted'], label: 'I sent a connection request', value: 'connection_sent' },
  { phase: ['connection_accepted', 'dm_sent', 'waiting_for_reply'], label: 'I sent a message', value: 'dm_sent' },
  { phase: ['dm_sent', 'waiting_for_reply', 'replied'], label: 'I followed up', value: 'followup_sent' },
  { phase: ['replied', 'conversation'], label: 'Meeting booked', value: 'meeting_booked' },
  { phase: ['conversation', 'meeting'], label: 'Proposal sent', value: 'proposal_sent' },
  { phase: ['conversation', 'meeting', 'proposal'], label: 'They are interested', value: 'interested' },
  { phase: ['conversation', 'meeting', 'proposal'], label: 'Not interested', value: 'not_interested' },
  { phase: ['dm_sent', 'waiting_for_reply', 'follow_up_due'], label: 'No response yet', value: 'no_response' },
  { phase: ['*'], label: 'Something else', value: 'other' },
]

/**
 * Context-aware relationship update logger.
 * Options are filtered by current phase — only relevant updates show.
 * Maps each selection to an existing canonical mutation path.
 */
export function LogRelationshipUpdate({ leadId, phase, onLogged, onCancel }: LogRelationshipUpdateProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visibleOptions = UPDATE_OPTIONS.filter(
    (opt) => opt.phase.includes(phase) || opt.phase.includes('*' as PhaseFilter),
  )

  async function handleLog() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      let res: Response
      if (selected === 'connection_accepted') {
        res = await fetch(`/api/leads/${leadId}/connection-accepted`, { method: 'POST' })
      } else {
        res = await fetch(`/api/leads/${leadId}/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: selected, sentText: '', direction: 'inbound' }),
        })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not log update.')
      setSelected(null)
      onLogged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log update.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-line bg-bone p-4">
      <div className="flex items-center gap-2">
        <Pencil className="size-4 text-stone" />
        <p className="text-[12px] font-medium text-ink">Log an update</p>
      </div>

      <div className="mt-3 space-y-1">
        {visibleOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(opt.value)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-[13px] transition-all duration-150',
              selected === opt.value
                ? 'border-orange/40 bg-orange/5 text-ink'
                : 'border-line bg-bone-raised/50 text-graphite hover:bg-bone-raised hover:text-ink',
            )}
          >
            <span className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded-full border transition-all',
              selected === opt.value
                ? 'border-orange bg-orange'
                : 'border-line bg-bone',
            )}>
              {selected === opt.value && <Check className="size-2.5 text-on-accent" />}
            </span>
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-2 text-[12px] text-status-danger" role="alert">{error}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="orange"
          size="sm"
          onClick={() => void handleLog()}
          disabled={saving || !selected}
          loading={saving}
        >
          Log this
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
