'use client'

import { useState } from 'react'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FieldError } from '@/components/ui/field-message'

export function LogReplyDialog({
  open,
  onClose,
  leadId,
  company,
  onLogged,
}: {
  open: boolean
  onClose: () => void
  leadId: string
  company: string
  onLogged: () => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!text.trim()) { setError('Paste the prospect\'s reply first.'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Could not save reply.')
      }
      setText('')
      onLogged()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save reply.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Log reply — ${company}`} description="Paste what the prospect wrote. Relay records their words and unlocks the Reply tab.">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="text-[13px]"
        placeholder="Paste the prospect's reply here..."
        disabled={saving}
      />
      {error && <FieldError className="mt-2">{error}</FieldError>}
      <DialogActions className="mt-4">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="orange" onClick={() => void submit()} disabled={saving || !text.trim()} loading={saving}>
          Save reply
        </Button>
      </DialogActions>
    </Dialog>
  )
}
