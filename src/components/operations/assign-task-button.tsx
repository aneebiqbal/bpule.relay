'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AssignTaskDialog } from '@/components/tasks/assign-task-dialog'

export function AssignTaskButton({
  reps,
  defaultAssigneeId,
  defaultLeadId,
  defaultProfileId,
  defaultTitle,
  leads,
  profiles,
}: {
  reps: Array<{ id: string; name: string }>
  defaultAssigneeId?: string
  defaultLeadId?: string
  defaultProfileId?: string
  defaultTitle?: string
  leads?: Array<{ id: string; company: string | null }>
  profiles?: Array<{ id: string; name: string }>
}) {
  const [open, setOpen] = useState(false)
  if (reps.length === 0) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relay-cta inline-flex items-center gap-1.5 text-[12px]">
        <Plus className="size-3.5" aria-hidden="true" />
        Assign task
      </button>
      <AssignTaskDialog
        open={open}
        onClose={() => setOpen(false)}
        reps={reps}
        defaultAssigneeId={defaultAssigneeId}
        defaultLeadId={defaultLeadId}
        defaultProfileId={defaultProfileId}
        defaultTitle={defaultTitle}
        leads={leads}
        profiles={profiles}
      />
    </>
  )
}
