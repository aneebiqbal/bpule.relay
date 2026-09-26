'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from 'cn'
import { ArrowRight } from 'lucide-react'

const HERO_SIGNALS = [
  { label: 'Sarah replied', x: 12, y: 18, featured: true },
  { label: 'Follow-up due', x: 78, y: 12 },
  { label: 'Job matched', x: 88, y: 42 },
  { label: 'New prospect', x: 5, y: 55 },
  { label: 'Proposal waiting', x: 72, y: 68 },
  { label: 'Connection accepted', x: 22, y: 78 },
  { label: 'Inbound message', x: 58, y: 85 },
  { label: 'Proof requested', x: 42, y: 8 },
]

/**
 * Hero — "Know what to do next."
 *
 * Signal → Relay → One Next Action
 * Scattered signals resolve into a single clear action.
 */
export function Hero() {
  const [phase, setPhase] = useState(0)
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduced) { setPhase(3); return }
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1600),
    ]
    return () => timers.forEach(clearTimeout)
  }, [reduced])

  const showSignals = phase >= 1
  const showAction = phase >= 2
  const resolved = phase >= 3

  return (
    <section id="hero" className="marketing-hero">
      <div className="marketing-hero__inner">
        {/* Headline */}
        <div className={cn('marketing-hero__headline', phase >= 1 && 'marketing-hero__headline--visible')}>
          <p className="text-mono-regular text-[10px] tracking-[0.2em] uppercase text-[var(--stone)]">
            Relay
          </p>
          <h1 className="mt-4 text-hero text-[var(--ink)]">
            Know what to do next.
          </h1>
          <p className="mt-5 max-w-[30rem] text-[15px] leading-relaxed text-[var(--graphite)] sm:text-[16px]">
            Your leads, conversations, opportunities and team activity are already telling you what matters.
            Relay connects the context and turns it into the next useful action.
          </p>
        </div>

        {/* CTAs */}
        <div className={cn('marketing-hero__ctas', phase >= 1 && 'marketing-hero__ctas--visible')}>
          <Link href="/signup" className="marketing-hero__primary-cta">
            Start with Relay
            <ArrowRight className="size-4" />
          </Link>
          <Link href="#how-it-works" className="marketing-hero__secondary-cta">
            See how it works
          </Link>
        </div>

        {/* Signal field + action card */}
        <div className={cn('marketing-hero__field', showSignals && 'marketing-hero__field--active')}>
          {/* Scattered signals */}
          {HERO_SIGNALS.map((signal, i) => (
            <span
              key={signal.label}
              className={cn(
                'marketing-hero__signal',
                signal.featured && 'marketing-hero__signal--featured',
                showSignals && 'marketing-hero__signal--visible',
                resolved && !signal.featured && 'marketing-hero__signal--receded',
              )}
              style={{
                left: `${signal.x}%`,
                top: `${signal.y}%`,
                transitionDelay: `${i * 60}ms`,
              }}
            >
              {signal.label}
            </span>
          ))}

          {/* Converging line (visual metaphor) */}
          <svg className="marketing-hero__converge" viewBox="0 0 100 100" aria-hidden="true">
            <line
              x1="12" y1="18" x2="50" y2="50"
              stroke="var(--orange-signal)"
              strokeWidth="0.3"
              strokeDasharray="1 1"
              opacity={showAction ? 0.4 : 0}
              style={{ transition: 'opacity 0.6s ease' }}
            />
          </svg>

          {/* Action card — the result */}
          <div className={cn('marketing-hero__action', showAction && 'marketing-hero__action--visible')}>
            <div className="marketing-hero__action-header">
              <span className="marketing-hero__action-tag">YOUR MOVE</span>
              <span className="marketing-hero__action-time">2m ago</span>
            </div>
            <p className="marketing-hero__action-title">Reply to Sarah</p>
            <p className="marketing-hero__action-context">
              &ldquo;Could you send something similar?&rdquo;
            </p>
            <div className="marketing-hero__action-insight">
              <span className="marketing-hero__action-dot" />
              They&apos;re asking for proof. Keep it relevant.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
