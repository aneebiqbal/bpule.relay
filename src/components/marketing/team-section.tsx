'use client'

import { cn } from 'cn'
import { useRevealer } from './marketing-motion'

const TEAM_MEMBERS = [
  { name: 'Ahmad', role: 'BD Lead', actions: 5, status: 'active', activity: 'Replied to Sarah · 2m' },
  { name: 'Hassan', role: 'Outreach', actions: 2, status: 'waiting', activity: 'DM sent · 1d' },
  { name: 'Dawood', role: 'Conversations', actions: 0, status: 'complete', activity: 'All caught up' },
]

/**
 * Team section — "Everyone knows what needs attention."
 */
export function TeamSection() {
  const { ref, revealed } = useRevealer<HTMLElement>()

  return (
    <section id="team" ref={ref} className="marketing-section marketing-section--ink">
      <div className="marketing-section__inner">
        <div className="marketing-revealer">
          <p className="text-mono-regular text-[10px] tracking-[0.2em] uppercase text-[var(--orange-signal)]">
            Team
          </p>
          <h2 className="mt-4 text-chapter text-[var(--console-text)]">
            Everyone knows what<br />needs attention.
          </h2>
        </div>

        <div className={cn('marketing-team', revealed && 'marketing-team--visible')}>
          {/* Team summary */}
          <div className="marketing-team__summary">
            <span className="marketing-team__summary-label">NEEDS ATTENTION</span>
            <span className="marketing-team__summary-count">2</span>
          </div>

          {/* Team members */}
          <div className="marketing-team__rows">
            {TEAM_MEMBERS.map((m, i) => (
              <div
                key={m.name}
                className={cn('marketing-team__row', m.status === 'active' && 'marketing-team__row--active')}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="marketing-team__info">
                  <span className="marketing-team__name">{m.name}</span>
                  <span className="marketing-team__role">{m.role}</span>
                </div>
                <div className="marketing-team__status">
                  {m.actions > 0 ? (
                    <span className="marketing-team__badge">{m.actions} actions</span>
                  ) : (
                    <span className="marketing-team__badge marketing-team__badge--done">Caught up</span>
                  )}
                  <span className="marketing-team__activity">{m.activity}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
