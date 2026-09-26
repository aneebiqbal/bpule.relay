'use client'

import { cn } from 'cn'
import { useRevealer } from './marketing-motion'

/**
 * Conversation section — "Stay with the conversation."
 * Demonstrates relationship continuity: message → insight → draft → sent → state change.
 */
export function ConversationSection() {
  const { ref, revealed } = useRevealer<HTMLElement>()

  return (
    <section id="conversation" ref={ref} className="marketing-section marketing-section--ink">
      <div className="marketing-section__inner">
        <div className="marketing-revealer">
          <p className="text-mono-regular text-[10px] tracking-[0.2em] uppercase text-[var(--orange-signal)]">
            Conversations
          </p>
          <h2 className="mt-4 text-chapter text-[var(--console-text)]">
            Stay with the conversation.
          </h2>
          <p className="mt-4 max-w-[28rem] text-[14px] leading-relaxed text-[var(--console-mute)]">
            Relay understands each reply and helps you respond — then waits for theirs.
          </p>
        </div>

        <div className={cn('marketing-conversation', revealed && 'marketing-conversation--visible')}>
          {/* Client message */}
          <div className="marketing-conversation__msg marketing-conversation__msg--client">
            <span className="marketing-conversation__msg-label">CLIENT · 11:42 AM</span>
            <p className="marketing-conversation__msg-text">
              &ldquo;This sounds useful. How do you normally structure engagements like this?&rdquo;
            </p>
          </div>

          {/* Relay insight */}
          <div className="marketing-conversation__insight">
            <span className="marketing-conversation__insight-dot" />
            <span>They&apos;re interested and asking about how you work. Keep this commercial.</span>
          </div>

          {/* Goal */}
          <div className="marketing-conversation__goal">
            <span className="marketing-conversation__goal-label">GOAL</span>
            <span className="marketing-conversation__goal-text">Answer clearly and move toward a call.</span>
          </div>

          {/* Draft */}
          <div className="marketing-conversation__draft">
            <p className="marketing-conversation__draft-text">
              We usually take ownership of a defined software outcome rather than adding another team for you to manage.
            </p>
            <div className="marketing-conversation__chips">
              <span className="marketing-chip">Shorter</span>
              <span className="marketing-chip">Warmer</span>
              <span className="marketing-chip">More direct</span>
            </div>
          </div>

          {/* State change */}
          <div className="marketing-conversation__state-change">
            <span className="marketing-conversation__state-from">YOUR MOVE</span>
            <span className="marketing-conversation__state-arrow">→</span>
            <span className="marketing-conversation__state-to">THEIR MOVE</span>
          </div>
        </div>
      </div>
    </section>
  )
}
