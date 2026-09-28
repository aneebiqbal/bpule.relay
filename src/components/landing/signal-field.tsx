'use client'

import { memo, type ReactNode } from 'react'
import { cn } from 'cn'
import type { FieldSignal } from './data'

export type FieldPhase = 0 | 1 | 2 | 3 | 4
/** idle → arrive → cluster → priority → settle */

/**
 * SignalField — the persistent signal canvas behind the landing.
 *
 * Nodes sit at `home` (scatter) and transition to `target` (converged)
 * as the phase advances. Everything is transform/opacity/left/top on
 * absolutely-positioned elements: no layout thrash, no runtime math.
 *
 * variant="dots"   → abstract signal dots (hero)
 * variant="chips"  → labeled signal chips (priority)
 */
export const SignalField = memo(function SignalField({
  signals,
  phase,
  variant = 'dots',
  className,
  children,
  fieldId,
}: {
  signals: FieldSignal[]
  phase: FieldPhase
  variant?: 'dots' | 'chips'
  className?: string
  children?: ReactNode
  fieldId?: string
}) {
  const clustered = phase >= 2
  const prioritized = phase >= 3

  return (
    <div className={cn('lg3-field', className)} aria-hidden="true" data-field={fieldId}>
      {/* Connection paths — relationships draw as clusters form */}
      <svg
        className="lg3-field__lines"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {signals.map((signal, i) => {
          if (!signal.label) return null
          const intoFeatured = signal.featured
          return (
            <line
              key={signal.id}
              x1={signal.home.x}
              y1={signal.home.y}
              x2={signal.target.x}
              y2={signal.target.y}
              pathLength={1}
              className={cn(
                'lg3-line',
                clustered && 'lg3-line--drawn',
                prioritized && (intoFeatured ? 'lg3-line--priority' : 'lg3-line--dim'),
              )}
              style={{ transitionDelay: `${i * 24}ms` }}
            />
          )
        })}
      </svg>

      {/* Signal nodes */}
      {signals.map((signal, i) => (
        <SignalNode
          key={signal.id}
          signal={signal}
          phase={phase}
          variant={variant}
          index={i}
        />
      ))}

      {/* Overlay layer — Do-This-Next card etc. */}
      {children && <div className="lg3-field__overlay">{children}</div>}
    </div>
  )
})

const SignalNode = memo(function SignalNode({
  signal,
  phase,
  variant,
  index,
}: {
  signal: FieldSignal
  phase: FieldPhase
  variant: 'dots' | 'chips'
  index: number
}) {
  const clustered = phase >= 2
  const prioritized = phase >= 3
  const settled = phase >= 4
  const featured = signal.featured ?? false

  const pos = clustered ? signal.target : signal.home
  const arrived = phase >= 1

  return (
    <div
      className={cn(
        'lg3-node',
        variant === 'chips' && 'lg3-node--chip',
        signal.minor && 'lg3-node--minor',
        arrived && 'lg3-node--arrived',
        clustered && 'lg3-node--clustered',
        prioritized && !featured && 'lg3-node--dimmed',
        prioritized && featured && 'lg3-node--featured',
        settled && !featured && 'lg3-node--drifting',
        signal.tone === 'cobalt' && 'lg3-node--cobalt',
      )}
      style={{
        ['--x' as string]: `${pos.x}%`,
        ['--y' as string]: `${pos.y}%`,
        ['--i' as string]: index,
      }}
    >
      {variant === 'dots' ? (
        <>
          <span className="lg3-node__dot" />
          {featured && <span className="lg3-node__ring" />}
          {signal.label && (
            <span className={cn('lg3-node__label', featured && 'lg3-node__label--featured')}>
              {signal.label}
            </span>
          )}
        </>
      ) : (
        <span className="lg3-chip">
          <span className="lg3-chip__dot" />
          <span className="lg3-chip__text">{signal.label}</span>
          <span className="lg3-chip__time">{signal.time}</span>
        </span>
      )}
    </div>
  )
})
