'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from 'cn'
import { useRevealer } from './marketing-motion'

/**
 * Final CTA — "Tomorrow morning, know where to start."
 */
export function FinalCtaSection() {
  const { ref, revealed } = useRevealer<HTMLElement>()

  return (
    <section id="final-cta" ref={ref} className="marketing-section marketing-section--final">
      <div className="marketing-section__inner">
        <div className={cn('marketing-final', revealed && 'marketing-final--visible')}>
          <p className="text-mono-regular text-[10px] tracking-[0.2em] uppercase text-[var(--orange-signal)]">
            Start
          </p>
          <h2 className="mt-4 text-chapter text-[var(--console-text)]">
            Tomorrow morning,<br />know where to start.
          </h2>
          <p className="mt-4 max-w-[26rem] text-[14px] leading-relaxed text-[var(--console-mute)]">
            Relay turns scattered signals into the next useful action.
          </p>
          <div className="marketing-final__ctas">
            <Link href="/signup" className="marketing-final__cta">
              Start with Relay
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/login" className="marketing-final__cta marketing-final__cta--ghost">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
