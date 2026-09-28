'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { SignalField, type FieldPhase } from './signal-field'
import { DoThisNext } from './do-this-next'
import { HERO_SIGNALS } from './data'
import { useReducedMotion } from './hooks'

/**
 * LandingHero — "Know what to do next."
 *
 * Convergence sequence (deterministic, plays once):
 *   0–500ms    signals arrive (staggered fade)
 *   500–1200ms context relationships form (nodes cluster, lines draw)
 *   1200–2000ms priority resolves (one turns orange, rest recede)
 *   2000–3000ms Do-This-Next settles, composition goes calm
 *
 * The headline is server-rendered and always visible — the field
 * animates beside it, never delaying content.
 */
export function LandingHero() {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<FieldPhase>(0)

  useEffect(() => {
    if (reduced) {
      setPhase(4)
      return
    }
    const timers = [
      setTimeout(() => setPhase(1), 350),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1750),
      setTimeout(() => setPhase(4), 2500),
    ]
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  return (
    <section id="hero" className="lg3-hero" aria-label="Relay — know what to do next" data-section="hero">
      <div className="lg3-hero__inner">
        <div className="lg3-hero__content">
          <p className="lg3-eyebrow">
            <span className="lg3-eyebrow__dot" aria-hidden="true" />
            Relay · Commercial signals
          </p>

          <h1 className="lg3-hero__title">
            Know what to do&nbsp;next.
          </h1>

          <p className="lg3-hero__sub">
            Your leads, conversations and outreach are already telling you what
            matters. Relay connects the context and points to the move.
          </p>

          <div className="lg3-hero__ctas">
            <Link href="/signup" className="lg3-button lg3-button--primary" data-landing-cta="hero-primary">
              Start with Relay
              <ArrowRight className="size-4" />
            </Link>
            <Link href="#product" className="lg3-button lg3-button--quiet">
              See how it works
            </Link>
          </div>

          <p className="lg3-hero__principle">
            AI prepares. People make the move.
          </p>
        </div>

        <div className="lg3-hero__fieldwrap">
          <SignalField signals={HERO_SIGNALS} phase={phase} fieldId="hero">
            <DoThisNext visible={phase >= 4} />
          </SignalField>
        </div>
      </div>
    </section>
  )
}
