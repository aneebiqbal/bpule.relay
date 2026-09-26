'use client'

import { cn } from 'cn'
import { useRevealer } from './marketing-motion'

const LOOP_STAGES = [
  { id: 'signal', label: 'Signal' },
  { id: 'understand', label: 'Understand' },
  { id: 'prioritize', label: 'Prioritize' },
  { id: 'act', label: 'Act' },
  { id: 'outcome', label: 'Outcome' },
  { id: 'learn', label: 'Learn' },
]

/**
 * Relay Loop — animated operating loop visualization.
 * Signal → Understand → Prioritize → Act → Outcome → Learn ↺
 */
export function RelayLoopSection() {
  const { ref, revealed } = useRevealer<HTMLElement>()

  return (
    <section id="relay-loop" ref={ref} className="marketing-section">
      <div className="marketing-section__inner">
        <div className="marketing-revealer">
          <p className="text-mono-regular text-[10px] tracking-[0.2em] uppercase text-[var(--orange-signal)]">
            The Relay loop
          </p>
          <h2 className="mt-4 text-chapter text-[var(--ink)]">
            Every signal becomes<br />a useful action.
          </h2>
        </div>

        {/* Loop visualization */}
        <div className={cn('marketing-loop', revealed && 'marketing-loop--visible')}>
          {LOOP_STAGES.map((stage, i) => (
            <div
              key={stage.id}
              className="marketing-loop__node"
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <span className="marketing-loop__node-dot" />
              <span className="marketing-loop__node-label">{stage.label}</span>
              {i < LOOP_STAGES.length - 1 && (
                <span className="marketing-loop__node-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </div>
          ))}
          {/* Loop back arrow */}
          <div className="marketing-loop__back" aria-hidden="true">↺</div>
        </div>

        {/* Example walkthrough */}
        <div className={cn('marketing-loop__example', revealed && 'marketing-loop__example--visible')}>
          <p className="marketing-loop__example-text">
            <span className="marketing-loop__example-event">Sarah replied</span>
            <span className="marketing-loop__example-arrow">→</span>
            <span className="marketing-loop__example-result">Reply to Sarah</span>
          </p>
        </div>
      </div>
    </section>
  )
}
