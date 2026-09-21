'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import type { DayClose, DayCloseStatus, ExceptionReason } from '@/lib/domain/types'

interface DayClosePanelProps {
  dayClose: DayClose | null
  canClose: boolean
  onClose: () => void
  onRequestException: (reason: ExceptionReason, note: string) => void
}

const EXCEPTION_REASONS: { value: ExceptionReason; label: string }[] = [
  { value: 'no_qualified_inventory', label: 'No qualified inventory' },
  { value: 'channel_limit', label: 'Channel limit reached' },
  { value: 'identity_blocked', label: 'Identity blocked' },
  { value: 'system_issue', label: 'System issue' },
  { value: 'client_priority', label: 'Client priority' },
  { value: 'manager_approved', label: 'Manager approved' },
  { value: 'other', label: 'Other' },
]

export function DayClosePanel({ dayClose, canClose, onClose, onRequestException }: DayClosePanelProps) {
  const [showExceptionForm, setShowExceptionForm] = useState(false)
  const [selectedReason, setSelectedReason] = useState<ExceptionReason>('other')
  const [note, setNote] = useState('')

  const isClosed = dayClose?.status === 'completed' || dayClose?.status === 'completed_with_exception' || dayClose?.status === 'missed'

  return (
    <section className="rounded-lg border border-line bg-bone-raised p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-medium text-ink">Day Close</h3>
        <StatusBadge status={getStatusLabel(dayClose?.status)} variant={getStatusVariant(dayClose?.status)} />
      </div>

      {dayClose?.status === 'completed' && (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-status-success">
          <CheckCircle2 className="size-4" />
          Day completed successfully
        </div>
      )}

      {dayClose?.status === 'completed_with_exception' && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-[13px] text-status-warning">
            <AlertTriangle className="size-4" />
            Exception recorded
          </div>
          {dayClose.exceptionReason && (
            <p className="text-[12px] text-graphite">
              Reason: {EXCEPTION_REASONS.find((r) => r.value === dayClose.exceptionReason)?.label}
            </p>
          )}
          {dayClose.exceptionNote && (
            <p className="text-[12px] text-graphite">{dayClose.exceptionNote}</p>
          )}
        </div>
      )}

      {dayClose?.status === 'missed' && (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-status-error">
          <XCircle className="size-4" />
          Day missed — target not met
        </div>
      )}

      {!isClosed && canClose && (
        <button
          onClick={onClose}
          className="mt-3 w-full rounded-md bg-orange px-4 py-2 text-[13px] font-medium text-white hover:bg-orange/90"
        >
          Close Day
        </button>
      )}

      {!isClosed && !canClose && !showExceptionForm && (
        <button
          onClick={() => setShowExceptionForm(true)}
          className="mt-3 w-full rounded-md border border-line bg-bone px-4 py-2 text-[13px] font-medium text-ink hover:bg-line/50"
        >
          Request Exception
        </button>
      )}

      {showExceptionForm && (
        <div className="mt-3 space-y-3">
          <select
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value as ExceptionReason)}
            className="w-full rounded-md border border-line bg-bone px-3 py-2 text-[13px] text-ink"
          >
            {EXCEPTION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Brief reason (optional)"
            className="w-full rounded-md border border-line bg-bone px-3 py-2 text-[13px] text-ink"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { onRequestException(selectedReason, note); setShowExceptionForm(false) }}
              className="flex-1 rounded-md bg-orange px-4 py-2 text-[13px] font-medium text-white hover:bg-orange/90"
            >
              Submit
            </button>
            <button
              onClick={() => setShowExceptionForm(false)}
              className="flex-1 rounded-md border border-line bg-bone px-4 py-2 text-[13px] font-medium text-ink hover:bg-line/50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function getStatusLabel(status: DayCloseStatus | null | undefined): string {
  switch (status) {
    case 'completed': return 'Completed'
    case 'completed_with_exception': return 'Exception'
    case 'missed': return 'Missed'
    case 'ready_to_close': return 'Ready'
    case 'in_progress': return 'In Progress'
    default: return 'Not Started'
  }
}

function getStatusVariant(status: DayCloseStatus | null | undefined): 'success' | 'warning' | 'danger' | 'cobalt' {
  switch (status) {
    case 'completed': return 'success'
    case 'completed_with_exception': return 'warning'
    case 'missed': return 'danger'
    default: return 'cobalt'
  }
}
