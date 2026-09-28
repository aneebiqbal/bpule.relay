import { LandingHero } from './hero'
import { ContextSection, PrioritySection, ConversationSection, CloseSection } from './sections'
import { MoveStateSection } from './move-state'
import { StudioRelaySection } from './studio-relay-handoff'

/**
 * ConvergenceLanding — one continuous signal system.
 *
 * 01 Hero        signals converge into one action
 * 02 Context     the signals behind it, on the real Today surface
 * 03 Priority    context stays visible, one move dominates
 * 04 Moves       ownership passes — yours becomes theirs
 * 05 Conversation Relay prepares, a human makes the move
 * 06 Studio→Relay demand created becomes demand captured
 * 07 Close       bring your signals
 */
export function ConvergenceLanding() {
  return (
    <div className="lg3">
      <LandingHero />
      <main>
        <ContextSection />
        <PrioritySection />
        <MoveStateSection />
        <ConversationSection />
        <StudioRelaySection />
        <CloseSection />
      </main>
    </div>
  )
}
