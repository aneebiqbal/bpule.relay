'use client'

import { cn } from 'cn'
import { useRevealer } from './marketing-motion'

const FRAGMENTS = [
  { label: 'Prospect', x: 8, y: 15 },
  { label: 'DM', x: 82, y: 8 },
  { label: 'Email', x: 15, y: 50 },
  { label: 'Client reply', x: 75, y: 42 },
  { label: 'Follow-up', x: 5, y: 80 },
  { label: 'Job', x: 88, y: 75 },
  { label: 'Team task', x: 45, y: 88 },
  { label: 'Content', x: 60, y: 12 },
]

/**
 * Problem section — fragmentation visualization.
 * "The work isn't missing. The context is."
 */
export function ProblemSection() {
  const { ref, revealed } = useRevealer<HTMLElement>()

  return (
    <section id="problem" ref={ref} className="marketing-section">
      <div className="marketing-section__inner">
        <div className="marketing-revealer">
          <p className="text-mono-regular text-[10px] tracking-[0.2em] uppercase text-[var(--stone)]">
            The problem
          </p>
          <h2 className="mt-4 text-chapter text-[var(--ink)]">
            The work isn&apos;t missing.<br />The context is.
          </h2>
          <p className="mt-4 max-w-[28rem] text-[14px] leading-relaxed text-[var(--graphite)]">
            The next useful action is usually buried across tools, tabs, messages and memory.
            Relay brings the context together.
          </p>
        </div>

        {/* Fragmented field */}
        <div className={cn('marketing-fragments', revealed && 'marketing-fragments--visible')}>
          {FRAGMENTS.map((f, i) => (
            <span
              key={f.label}
              className="marketing-fragment"
              style={{
                left: `${f.x}%`,
                top: `${f.y}%`,
                transitionDelay: `${i * 60}ms`,
              }}
            >
              {f.label}
            </span>
          ))}
          {/* Connection lines appear on reveal */}
          <svg className="marketing-fragments__lines" viewBox="0 0 100 100" aria-hidden="true">
            <line x1="8" y1="15" x2="45" y2="40" stroke="var(--orange-signal)" strokeWidth="0.2" opacity="0.3" />
            <line x1="82" y1="8" x2="55" y2="40" stroke="var(--orange-signal)" strokeWidth="0.2" opacity="0.3" />
            <line x1="15" y1="50" x2="45" y2="40" stroke="var(--orange-signal)" strokeWidth="0.2" opacity="0.3" />
            <line x1="75" y1="42" x2="55" y2="40" stroke="var(--orange-signal)" strokeWidth="0.2" opacity="0.3" />
            <line x1="5" y1="80" x2="45" y2="60" stroke="var(--orange-signal)" strokeWidth="0.2" opacity="0.3" />
            <line x1="88" y1="75" x2="55" y2="60" stroke="var(--orange-signal)" strokeWidth="0.2" opacity="0.3" />
            <line x1="45" y1="88" x2="45" y2="60" stroke="var(--orange-signal)" strokeWidth="0.2" opacity="0.3" />
            <line x1="60" y1="12" x2="55" y2="40" stroke="var(--orange-signal)" strokeWidth="0.2" opacity="0.3" />
          </svg>
          {/* Convergence point */}
          <div className="marketing-fragments__center">
            <span className="marketing-fragments__center-dot" />
          </div>
        </div>
      </div>
    </section>
  )
}
