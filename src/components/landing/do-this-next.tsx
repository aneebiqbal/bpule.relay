'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from 'cn'

/**
 * DoThisNext — reconstruction of the real "Do This Next" card from
 * Relay's Today workspace (relay-today-workspace.tsx). Same structure,
 * same classes, same visual language. The product is the hero.
 */
export function DoThisNext({
  compact = false,
  visible = true,
  className,
}: {
  compact?: boolean
  visible?: boolean
  className?: string
}) {
  return (
    <div className={cn('lg3-dtn', compact && 'lg3-dtn--compact', visible && 'lg3-dtn--visible', className)}>
      <div className="lg3-dtn__stem" aria-hidden="true" />
      <div className="lg3-dtn__card">
        <div className="lg3-dtn__header">
          <div className="flex items-center gap-2">
            <span className="rounded-sm bg-orange px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-on-accent">
              Reply
            </span>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
              Do This Next
            </p>
          </div>
          <span className="text-mono-medium text-[10px] text-stone">2m ago</span>
        </div>

        <h3 className="lg3-dtn__title">Reply to Sarah</h3>
        <p className="lg3-dtn__sub">
          &ldquo;Could you send something similar?&rdquo; — she&apos;s asking for proof.
        </p>

        {!compact && (
          <div className="lg3-dtn__why">
            <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">Why</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink">
              Active conversation · proof request · matches your recent delivery work
            </p>
          </div>
        )}

        <div className="lg3-dtn__prepared">
          <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">
            Relay prepared
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink">
            A draft reply in your voice — review it, edit it, send it.
          </p>
        </div>

        <Link
          href="/signup"
          className="lg3-dtn__cta"
          data-landing-cta="do-this-next"
        >
          Review reply
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}
