'use client'

import { cn } from 'cn'
import { useRevealer } from './marketing-motion'

/**
 * Your Move / Their Move — signature marketing moment.
 * Shows Relay knows when NOT to act.
 */
export function MoveStateDemo() {
  const { ref, revealed } = useRevealer<HTMLElement>()

  return (
    <section id="human-control" ref={ref} className="marketing-section">
      <div className="marketing-section__inner">
        <div className="marketing-revealer">
          <p className="text-mono-regular text-[10px] tracking-[0.2em] uppercase text-[var(--stone)]">
            Human control
          </p>
          <h2 className="mt-4 text-chapter text-[var(--ink)]">
            Sometimes the right next<br />action is to wait.
          </h2>
        </div>

        <div className={cn('marketing-moves', revealed && 'marketing-moves--visible')}>
          {/* Your Move */}
          <div className="marketing-move marketing-move--yours">
            <div className="marketing-move__tag marketing-move__tag--yours">YOUR MOVE</div>
            <p className="marketing-move__title">Sarah replied.</p>
            <p className="marketing-move__desc">Answer her pricing question.</p>
            <div className="marketing-move__action">Prepare Reply</div>
          </div>

          {/* Their Move */}
          <div className="marketing-move marketing-move--theirs">
            <div className="marketing-move__tag marketing-move__tag--theirs">THEIR MOVE</div>
            <p className="marketing-move__title">DM sent yesterday.</p>
            <p className="marketing-move__desc">No action needed yet.</p>
            <div className="marketing-move__action marketing-move__action--muted">Waiting</div>
          </div>
        </div>

        <p className={cn('marketing-moves__footnote', revealed && 'marketing-moves__footnote--visible')}>
          AI does the preparation. People make the move.
        </p>
      </div>
    </section>
  )
}
