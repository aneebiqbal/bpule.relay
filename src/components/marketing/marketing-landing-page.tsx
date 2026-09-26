'use client'

import { MarketingNav } from './marketing-nav'
import { Hero } from './hero'
import { ProblemSection } from './problem-section'
import { IntelligenceSection } from './intelligence-section'
import { PrioritySection } from './priority-section'
import { ConversationSection } from './conversation-section'
import { MoveStateDemo } from './move-state-demo'
import { TeamSection } from './team-section'
import { StudioSection } from './studio-section'
import { RelayLoopSection } from './relay-loop-section'
import { ProductProofSection } from './product-proof-section'
import { FinalCtaSection } from './final-cta'
import { MarketingFooter } from './marketing-footer'

/**
 * MarketingLandingPage — the definitive public expression of Relay.
 *
 * Narrative flow:
 * 1. Hero — Know what to do next
 * 2. Problem — The work isn't missing. The context is.
 * 3. Intelligence — Context before action
 * 4. Priority — Not another dashboard. A decision.
 * 5. Conversation — Stay with the conversation
 * 6. Move states — Sometimes the right next action is to wait
 * 7. Team — Everyone knows what needs attention
 * 8. Studio — Create demand
 * 9. Relay Loop — Every signal becomes a useful action
 * 10. Product Proof — Built around the work
 * 11. Final CTA — Tomorrow morning, know where to start
 */
export function MarketingLandingPage() {
  return (
    <div className="marketing-landing">
      <MarketingNav />
      <main>
        <Hero />
        <ProblemSection />
        <IntelligenceSection />
        <PrioritySection />
        <ConversationSection />
        <MoveStateDemo />
        <TeamSection />
        <StudioSection />
        <RelayLoopSection />
        <ProductProofSection />
        <FinalCtaSection />
      </main>
      <MarketingFooter />
    </div>
  )
}
