'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from 'cn'
import { motion, LayoutGroup } from 'motion/react'
import { MOVE_ITEMS, type MoveItem } from './data'
import { useInViewOnce, useReducedMotion } from './hooks'

/**
 * MoveState — YOUR MOVE / THEIR MOVE.
 *
 * The signature interaction: acting on a YOUR MOVE item executes it —
 * orange drains to bone, movement stops, and ownership passes to them.
 * One transfer plays automatically on scroll; the rest are yours to trigger.
 */
export function MoveStateSection() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const [items, setItems] = useState<MoveItem[]>(MOVE_ITEMS)
  const [executing, setExecuting] = useState<string | null>(null)
  const autoRef = useRef(false)
  const execRef = useRef(false)

  const execute = (id: string) => {
    if (execRef.current) return
    execRef.current = true
    setExecuting(id)
    window.setTimeout(() => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, stack: 'theirs' as const, action: 'Wait', note: `${it.action} sent · waiting` }
            : it,
        ),
      )
      setExecuting(null)
      execRef.current = false
    }, 950)
  }

  // Auto-demo: one transfer plays when the section enters view.
  useEffect(() => {
    if (!inView || autoRef.current) return
    autoRef.current = true
    if (reduced) return
    const t = window.setTimeout(() => execute('mv-sarah'), 1200)
    return () => window.clearTimeout(t)
  }, [inView, reduced])

  const yours = items.filter((i) => i.stack === 'yours')
  const theirs = items.filter((i) => i.stack === 'theirs')

  return (
    <section id="moves" className="lg3-section" data-section="moves">
      <div className="lg3-section__inner">
        <motion.header
          className="lg3-section__head"
          initial={false}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="lg3-section__meta">
            <span className="lg3-section__index">04</span>
            Move ownership
          </p>
          <h2 className="lg3-section__title">Sometimes the right move is to wait.</h2>
          <p className="lg3-section__lede">
            Relay tracks whose move it is. When it&apos;s yours, you act. When
            it&apos;s theirs, Relay protects the relationship.
          </p>
        </motion.header>

        <div ref={ref} className="lg3-moves" data-moves="">
          <LayoutGroup>
            <div className="lg3-moves__col" data-stack="yours">
              <p className="lg3-moves__colhead lg3-moves__colhead--yours">
                Your move
                <span className="lg3-moves__count">{yours.length}</span>
              </p>
              {yours.map((item) => (
                <MoveCard
                  key={item.id}
                  item={item}
                  executing={executing === item.id}
                  onExecute={() => execute(item.id)}
                />
              ))}
              {yours.length === 0 && (
                <p className="lg3-moves__empty">Nothing is waiting on you.</p>
              )}
            </div>

            <div className="lg3-moves__divider" aria-hidden="true">
              <span className="lg3-moves__divider-label">ownership passes</span>
            </div>

            <div className="lg3-moves__col" data-stack="theirs">
              <p className="lg3-moves__colhead lg3-moves__colhead--theirs">
                Their move
                <span className="lg3-moves__count">{theirs.length}</span>
              </p>
              {theirs.map((item) => (
                <MoveCard
                  key={item.id}
                  item={item}
                  executing={executing === item.id}
                  onExecute={() => execute(item.id)}
                />
              ))}
            </div>
          </LayoutGroup>
        </div>

        <p className="lg3-moves__hint">
          Watch the ownership flip — or trigger it yourself.
        </p>
      </div>
    </section>
  )
}

function MoveCard({
  item,
  executing,
  onExecute,
}: {
  item: MoveItem
  executing: boolean
  onExecute: () => void
}) {
  const yours = item.stack === 'yours'
  return (
    <motion.article
      layout
      layoutId={item.id}
      className={cn(
        'lg3-movecard',
        yours ? 'lg3-movecard--yours' : 'lg3-movecard--theirs',
        executing && 'lg3-movecard--executing',
      )}
      transition={{ layout: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } }}
      data-move={item.id}
      data-stack={item.stack}
    >
      <div className="lg3-movecard__head">
        <span className={cn('lg3-movecard__badge', !yours && 'lg3-movecard__badge--theirs')}>
          {yours ? 'Your move' : 'Their move'}
        </span>
      </div>
      <p className="lg3-movecard__who">{item.who}</p>
      <p className="lg3-movecard__signal">{item.signal}</p>
      {yours ? (
        <button
          type="button"
          className="lg3-movecard__action"
          onClick={onExecute}
          data-move-action={item.id}
        >
          {item.action}
          <ArrowRight className="size-3" />
        </button>
      ) : (
        <p className="lg3-movecard__wait">
          <span className="lg3-movecard__waitdot" aria-hidden="true" />
          {item.note ?? 'Waiting'}
        </p>
      )}
    </motion.article>
  )
}
