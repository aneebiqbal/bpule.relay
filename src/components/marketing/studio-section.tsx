'use client'

import { cn } from 'cn'
import { useRevealer } from './marketing-motion'

const STUDIO_STAGES = [
  { id: 'idea', label: 'Idea' },
  { id: 'insight', label: 'Insight' },
  { id: 'post', label: 'Post' },
  { id: 'visual', label: 'Visual' },
  { id: 'publish', label: 'Publish' },
]

/**
 * Studio section — "Create demand."
 * Visual shift to cobalt tone.
 */
export function StudioSection() {
  const { ref, revealed } = useRevealer<HTMLElement>()

  return (
    <section id="studio" ref={ref} className="marketing-section marketing-section--cobalt">
      <div className="marketing-section__inner">
        <div className="marketing-revealer">
          <p className="text-mono-regular text-[10px] tracking-[0.2em] uppercase text-[var(--cobalt-signal)]">
            Studio
          </p>
          <h2 className="mt-4 text-chapter text-[var(--console-text)]">
            Create demand.
          </h2>
          <p className="mt-4 max-w-[28rem] text-[14px] leading-relaxed text-[var(--console-mute)]">
            Studio helps you publish calibrated content. What you create becomes signals for Relay.
          </p>
        </div>

        {/* Studio pipeline */}
        <div className={cn('marketing-studio', revealed && 'marketing-studio--visible')}>
          {STUDIO_STAGES.map((stage, i) => (
            <div
              key={stage.id}
              className="marketing-studio__stage"
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <span className="marketing-studio__stage-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="marketing-studio__stage-label">{stage.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
