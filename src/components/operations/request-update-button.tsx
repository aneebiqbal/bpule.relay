'use client'

import { useState } from 'react'
import { AssignTaskDialog } from '@/components/tasks/assign-task-dialog'

/** Reuses the canonical task engine — a Request Update is an assigned task. */
export function RequestUpdateButton({
  reps,
  defaultAssigneeId,
}: {
  reps: Array<{ id: string; name: string }>
  defaultAssigneeId?: string
}) {
  const [open, setOpen] = useState(false)
  if (reps.length === 0) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center rounded-lg border border-line bg-bone px-2.5 text-[13px] text-ink transition-colors hover:bg-bone-raised"
      >
        Request update
      </button>
      <AssignTaskDialog
        open={open}
        onClose={() => setOpen(false)}
        reps={reps}
        defaultAssigneeId={defaultAssigneeId}
        defaultKind="REQUEST_UPDATE"
        defaultTitle="Update needed"
      />
    </>
  )
}
