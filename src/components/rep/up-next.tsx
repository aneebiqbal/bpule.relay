import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { RelayTodayAction } from '@/components/relay-today-workspace'

interface UpNextProps {
  actions: RelayTodayAction[]
  excludeId?: string
  max?: number
}

export function UpNext({ actions, excludeId, max = 4 }: UpNextProps) {
  const visible = actions
    .filter((a) => a.id !== excludeId)
    .slice(0, max)

  if (visible.length === 0) return null

  return (
    <section className="space-y-2">
      <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
        Up Next
      </p>
      <div className="overflow-hidden rounded-lg border border-line bg-bone-raised">
        {visible.map((action, index) => (
          <div
            key={action.id}
            className="border-b border-line/60 last:border-b-0"
          >
            <Link
              href={action.href}
              className="group flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-bone"
            >
              <span className="w-5 mt-0.5 text-mono-medium text-[11px] text-stone/60">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">
                  {action.title}
                </p>
                {action.whatHappened && (
                  <p className="mt-0.5 text-[11px] text-stone">
                    <span className="text-mono-medium uppercase tracking-[0.1em]">What </span>
                    {action.whatHappened}
                  </p>
                )}
                {action.whyItMatters && (
                  <p className="mt-0.5 text-[11px] text-graphite">
                    <span className="text-mono-medium uppercase tracking-[0.1em]">Why </span>
                    {action.whyItMatters}
                  </p>
                )}
                {action.proof && (
                  <p className="mt-0.5 text-[11px] text-graphite">
                    <span className="text-mono-medium uppercase tracking-[0.1em]">Evidence </span>
                    {action.proof}
                  </p>
                )}
                {action.humanAction && (
                  <p className="mt-1.5 text-[13px] font-medium text-orange">
                    {action.humanAction}
                  </p>
                )}
              </div>
              <ArrowRight className="size-3.5 mt-0.5 shrink-0 text-stone transition-colors group-hover:text-ink" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
