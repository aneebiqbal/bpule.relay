'use client'

import { cn } from 'cn'
import { useRevealer } from './marketing-motion'

const PROOF_ITEMS = [
  { trigger: 'Connection accepted', result: 'First message available' },
  { trigger: 'Client replied', result: 'Follow-up disappears' },
  { trigger: 'No reply', result: 'Wait — no action needed' },
  { trigger: 'Follow-up due', result: 'Action appears' },
  { trigger: 'Proposal sent', result: 'Their Move' },
]

/**
 * Product Proof — "Built around the work."
 * Shows meaningful product behaviors, not fake testimonials.
 */
export function ProductProofSection() {
  const { ref, revealed } = useRevealer<HTMLElement>()

  return (
    <section id="product-proof" ref={ref} className="marketing-section marketing-section--ink">
      <div className="marketing-section__inner">
        <div className="marketing-revealer">
          <p className="text-mono-regular text-[10px] tracking-[0.2em] uppercase text-[var(--orange-signal)]">
            Product proof
          </p>
          <h2 className="mt-4 text-chapter text-[var(--console-text)]">
            Built around the work.
          </h2>
          <p className="mt-4 max-w-[28rem] text-[14px] leading-relaxed text-[var(--console-mute)]">
            Every behavior follows from the relationship. Not from a marketing deck.
          </p>
        </div>

        <div className={cn('marketing-proof', revealed && 'marketing-proof--visible')}>
          {PROOF_ITEMS.map((item, i) => (
            <div
              key={item.trigger}
              className="marketing-proof__row"
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <span className="marketing-proof__trigger">{item.trigger}</span>
              <span className="marketing-proof__arrow">→</span>
              <span className="marketing-proof__result">{item.result}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
