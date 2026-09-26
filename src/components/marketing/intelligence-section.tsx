'use client'

import { cn } from 'cn'
import { useRevealer } from './marketing-motion'

const EVIDENCE_ITEMS = [
  { k: 'Person', v: 'Sarah Chen' },
  { k: 'Company', v: 'Acme Corp' },
  { k: 'Role', v: 'VP Engineering' },
  { k: 'Signal', v: 'Asked for relevant proof' },
  { k: 'Source', v: 'LinkedIn · Today' },
  { k: 'Relationship', v: 'Potential buyer' },
]

/**
 * Intelligence section — "Context before action."
 * Shows information assembling progressively.
 */
export function IntelligenceSection() {
  const { ref, revealed } = useRevealer<HTMLElement>()

  return (
    <section id="intelligence" ref={ref} className="marketing-section marketing-section--ink">
      <div className="marketing-section__inner">
        <div className="marketing-revealer">
          <p className="text-mono-regular text-[10px] tracking-[0.2em] uppercase text-[var(--orange-signal)]">
            Relay understands
          </p>
          <h2 className="mt-4 text-chapter text-[var(--console-text)]">
            Context before action.
          </h2>
          <p className="mt-4 max-w-[28rem] text-[14px] leading-relaxed text-[var(--console-mute)]">
            A generic AI needs the whole story every time. Relay is already in it.
          </p>
        </div>

        {/* Evidence card */}
        <div className={cn('marketing-evidence', revealed && 'marketing-evidence--visible')}>
          <div className="marketing-evidence__header">
            <span className="marketing-evidence__tag">LEAD INTELLIGENCE</span>
            <span className="marketing-evidence__time">ASSEMBLED</span>
          </div>
          <div className="marketing-evidence__name">Sarah Chen</div>
          <div className="marketing-evidence__meta">VP Engineering · Acme Corp</div>
          <dl className="marketing-evidence__fields">
            {EVIDENCE_ITEMS.map((item, i) => (
              <div
                key={item.k}
                className="marketing-evidence__field"
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <dt>{item.k}</dt>
                <dd>{item.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
