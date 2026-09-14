import { cn } from 'cn'

/**
 * One stage of a sequential task (paste, verify, confirm), connected by a
 * rule rather than boxed — a process reads as a sequence, not a set of
 * interchangeable cards.
 */
export function Step({
  n,
  title,
  hint,
  last = false,
  children,
}: {
  n: number
  title: string
  hint?: string
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-orange text-[11px] font-semibold text-bone shadow-sm">
          {n}
        </span>
        {last ? null : <span className="mt-2 w-px flex-1 bg-line/60" aria-hidden="true" />}
      </div>
      <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-10')}>
        <h2 className="text-[15px] font-medium text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-slate">{hint}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </section>
  )
}
