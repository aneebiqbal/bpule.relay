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
          <Link
            key={action.id}
            href={action.href}
            className="group flex items-center gap-3 border-b border-line/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-bone"
          >
            <span className="w-5 text-mono-medium text-[11px] text-stone/60">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-medium text-ink">
                  {action.title}
                </span>
              </div>
              <p className="truncate text-[11px] text-graphite">
                {action.identity && (
                  <>
                    <span className="text-stone">Working as </span>
                    {action.identity.name}
                    {action.identity.channel && ` · ${action.identity.channel.toUpperCase()}`}
                    {' · '}
                  </>
                )}
                {action.whyLines[0] ?? action.subtitle}
              </p>
            </div>
            <ArrowRight className="size-3.5 shrink-0 text-stone transition-colors group-hover:text-orange" />
          </Link>
        ))}
      </div>
    </section>
  )
}
