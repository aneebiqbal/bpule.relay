import { CheckCircle2, MessageSquare, Clock, ArrowRight } from 'lucide-react'

interface YourDaySummaryProps {
  repName: string
  totalRemaining: number
  repliesWaiting: number
  followUpsDue: number
  outreachRemaining: number
  isComplete: boolean
  isWorkingDay: boolean
  identityCount: number
}

export function YourDaySummary({
  repName,
  totalRemaining,
  repliesWaiting,
  followUpsDue,
  outreachRemaining,
  isComplete,
  isWorkingDay,
  identityCount,
}: YourDaySummaryProps) {
  const greeting = getGreeting()

  if (!isWorkingDay) {
    return (
      <section className="rounded-lg border border-line bg-bone-raised p-5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Your Day
        </p>
        <h2 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">
          {greeting}, {repName}
        </h2>
        <p className="mt-2 text-[13px] text-graphite">
          Today is a non-working day. No targets are due.
        </p>
      </section>
    )
  }

  if (isComplete) {
    return (
      <section className="rounded-lg border border-status-success/20 bg-status-success/5 p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-status-success" />
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-status-success">
            All Complete
          </p>
        </div>
        <h2 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">
          {greeting}, {repName}
        </h2>
        <p className="mt-2 text-[13px] text-graphite">
          Today&apos;s assigned work is complete.
          {outreachRemaining === 0 && (
            <> {identityCount} profile{identityCount !== 1 ? 's' : ''} handled.</>
          )}
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-line bg-bone-raised p-5">
      <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
        Your Day
      </p>
      <h2 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">
        {greeting}, {repName}
      </h2>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[32px] font-light tracking-[-0.03em] text-orange">
          {totalRemaining}
        </span>
        <span className="text-[14px] text-graphite">
          action{totalRemaining === 1 ? '' : 's'} remaining
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {repliesWaiting > 0 && (
          <ActionCount icon={MessageSquare} count={repliesWaiting} label="reply" />
        )}
        {followUpsDue > 0 && (
          <ActionCount icon={Clock} count={followUpsDue} label="follow-up" />
        )}
        {outreachRemaining > 0 && (
          <ActionCount icon={ArrowRight} count={outreachRemaining} label="outreach" />
        )}
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line/60">
        <div
          className="h-full rounded-full bg-orange transition-all duration-500"
          style={{ width: `${Math.min(Math.max(8, 100 - (totalRemaining * 4)), 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-stone">
        {identityCount} profile{identityCount !== 1 ? 's' : ''}
      </p>
    </section>
  )
}

function ActionCount({ icon: Icon, count, label }: { icon: React.ComponentType<{ className?: string }>; count: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-line bg-bone px-2.5 py-1.5">
      <Icon className="size-3.5 text-stone" />
      <span className="text-[13px] font-medium text-ink">{count}</span>
      <span className="text-[12px] text-graphite">
        {label}{count === 1 ? '' : 's'}
      </span>
    </div>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
