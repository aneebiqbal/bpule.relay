'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { AssignTaskDialog } from '@/components/tasks/assign-task-dialog'
import type { AssignedTaskKind } from '@/lib/tasks/types'

/**
 * One manager intervention menu (Phase 8.28), reused on every Team / Account
 * surface. Mutations go through the canonical task engine (POST /api/tasks);
 * lead reassignment and sender-profile changes open the lead's owner tab,
 * which already enforces its own permissions.
 */
export function InterventionMenu({
  repId,
  leadId,
  companyKey,
  reps,
  canAssign,
  notesAnchor,
  label = 'Actions',
}: {
  repId?: string | null
  leadId?: string | null
  companyKey?: string | null
  reps: Array<{ id: string; name: string }>
  canAssign: boolean
  /** In-page anchor of a NotesPanel, e.g. "#notes". */
  notesAnchor?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<AssignedTaskKind | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

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

  const item = 'block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-bone focus-visible:bg-bone focus-visible:outline-none'

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink hover:bg-bone-raised"
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-line bg-bone-raised p-1 shadow-lg">
          {canAssign && (
            <>
              <button type="button" role="menuitem" className={item} onClick={() => { setDialog('REVIEW'); setOpen(false) }}>
                Assign task
              </button>
              <button type="button" role="menuitem" className={item} onClick={() => { setDialog('REQUEST_UPDATE'); setOpen(false) }}>
                Request update
              </button>
            </>
          )}
          {leadId && (
            <>
              <Link role="menuitem" className={item} href={`/leads/${leadId}?tab=owner`}>
                Reassign lead
              </Link>
              <Link role="menuitem" className={item} href={`/leads/${leadId}?tab=owner`}>
                Change sender profile
              </Link>
              <Link role="menuitem" className={item} href={`/chats?lead=${leadId}`}>
                Open conversation
              </Link>
            </>
          )}
          {companyKey && (
            <Link role="menuitem" className={item} href={`/accounts/${encodeURIComponent(companyKey)}`}>
              Open account
            </Link>
          )}
          {notesAnchor && (
            <a role="menuitem" className={item} href={notesAnchor} onClick={() => setOpen(false)}>
              Add note
            </a>
          )}
        </div>
      )}
      {canAssign && (
        <AssignTaskDialog
          open={dialog !== null}
          onClose={() => setDialog(null)}
          reps={reps}
          defaultAssigneeId={repId ?? undefined}
          defaultLeadId={leadId ?? undefined}
          defaultKind={dialog ?? 'REVIEW'}
        />
      )}
    </div>
  )
}
