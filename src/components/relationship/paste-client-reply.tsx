'use client'

import { useState } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquare, Send } from 'lucide-react'

interface PasteClientReplyProps {
  leadId: string
  contactName?: string | null
  channel?: string
  onSaved?: () => void
  onCancel?: () => void
}

/**
 * Paste client reply capture. One easy flow:
 * paste → save → canonical inbound event → state refresh.
 */
export function PasteClientReply({
  leadId,
  contactName,
  channel = 'LinkedIn',
  onSaved,
  onCancel,
}: PasteClientReplyProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!text.trim()) {
      setError('Paste their message first.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not save their message.')
      setText('')
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save their message.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-line bg-bone p-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-orange" />
        <p className="text-[12px] font-medium text-ink">
          {contactName ?? 'They'} replied
        </p>
        <span className="text-[11px] text-stone">· {channel}</span>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="mt-3 text-[13px]"
        placeholder="Paste their message here..."
        disabled={saving}
      />

      {error && (
        <p className="mt-2 text-[12px] text-status-danger" role="alert">{error}</p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="orange"
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || !text.trim()}
            loading={saving}
          >
            <Send className="size-3.5" />
            Save Reply
          </Button>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
        <span className="text-[11px] text-stone">
          {text.trim().split(/\s+/).filter(Boolean).length} words
        </span>
      </div>
    </div>
  )
}
