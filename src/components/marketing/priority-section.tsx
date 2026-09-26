'use client'

import { cn } from 'cn'
import { useRevealer } from './marketing-motion'

const QUEUE_ITEMS = [
  { n: 12, label: 'prospects', active: false },
  { n: 4, label: 'conversations', active: false },
  { n: 3, label: 'follow-ups due', active: false },
  { n: 2, label: 'proposals waiting', active: false },
]

/**
 * Priority section — "Not another dashboard. A decision."
 * Shows multiple tasks resolving into one clear action.
 */
export function PrioritySection() {
  const { ref, revealed } = useRevealer<HTMLElement>()

  return (
    <section id="priority" ref={ref} className="marketing-section">
      <div className="marketing-section__inner">
        <div className="marketing-revealer">
          <p className="text-mono-regular text-[10px] tracking-[0.2em] uppercase text-[var(--orange-signal)]">
            Relay prioritizes
          </p>
          <h2 className="mt-4 text-chapter text-[var(--ink)]">
            Not another dashboard.<br />A decision.
          </h2>
          <p className="mt-4 max-w-[28rem] text-[14px] leading-relaxed text-[var(--graphite)]">
            Relay knows what deserves your attention now — and what can wait.
          </p>
        </div>

        <div className={cn('marketing-priority', revealed && 'marketing-priority--visible')}>
          {/* Queue items — recede */}
          <div className="marketing-priority__queue">
            {QUEUE_ITEMS.map((item, i) => (
              <div
                key={item.label}
                className="marketing-priority__queue-item"
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <span className="marketing-priority__queue-n">{item.n}</span>
                <span className="marketing-priority__queue-label">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Selected action */}
          <div className="marketing-priority__selected">
            <div className="marketing-priority__selected-tag">DO THIS NEXT</div>
            <p className="marketing-priority__selected-title">Reply to Sarah</p>
            <p className="marketing-priority__selected-meta">Client replied 2m ago · LinkedIn</p>
            <div className="marketing-priority__selected-cta">
              <span className="marketing-priority__selected-dot" />
              Prepare Reply
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
