import {
  CalendarOff,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ShieldCheck,
  User,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { cn } from 'cn'

/**
 * The one responsibility-status badge. Text + icon + semantic color, never
 * color alone. Every surface that names a responsibility state renders this.
 */
export type ResponsibilityStatus =
  | 'PRIMARY'
  | 'TEMPORARY'
  | 'BACKUP'
  | 'READY'
  | 'ACCESS_NEEDED'
  | 'UNASSIGNED'
  | 'ON_LEAVE'

const STATUS_META: Record<ResponsibilityStatus, { label: string; icon: LucideIcon; className: string }> = {
  PRIMARY: { label: 'Primary', icon: ShieldCheck, className: 'bg-bone text-graphite ring-line' },
  TEMPORARY: { label: 'Temporary cover', icon: UserCheck, className: 'bg-status-info/10 text-[#2f48b8] ring-status-info/20' },
  BACKUP: { label: 'Backup', icon: User, className: 'bg-bone text-stone ring-line' },
  READY: { label: 'Ready', icon: CircleCheck, className: 'bg-status-success/10 text-[#256b4a] ring-status-success/20' },
  ACCESS_NEEDED: { label: 'Access needed', icon: CircleAlert, className: 'bg-status-warning/10 text-[#7d5410] ring-status-warning/20' },
  UNASSIGNED: { label: 'Unassigned', icon: CircleDashed, className: 'bg-status-danger/10 text-[#a8342a] ring-status-danger/20' },
  ON_LEAVE: { label: 'On leave', icon: CalendarOff, className: 'bg-bone text-stone ring-line' },
}

export function ResponsibilityStatus({
  status,
  className,
}: {
  status: ResponsibilityStatus
  className?: string
}) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ring-1',
        meta.className,
        className,
      )}
    >
      <Icon className="size-2.5" aria-hidden="true" />
      {meta.label}
    </span>
  )
}
