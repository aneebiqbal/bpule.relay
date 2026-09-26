'use client'

import { cn } from 'cn'

export type RelayPresenceState = 'idle' | 'thinking' | 'ready' | 'waiting' | 'needs_information'

interface RelayPresenceProps {
  state: RelayPresenceState
  size?: 'sm' | 'md'
}

/**
 * RelayPresence — minimal Relay mark glyph.
 *
 * A small circular progress/radar-style indicator using Relay brand geometry.
 * Bone/neutral normally, Signal Orange when action is required.
 * Restrained 120–220ms transitions. Respects prefers-reduced-motion.
 */
export function RelayPresence({ state, size = 'sm' }: RelayPresenceProps) {
  const isUrgent = state === 'needs_information' || state === 'ready'
  const isThinking = state === 'thinking'

  const dotSize = size === 'sm' ? 'size-1.5' : 'size-2'
  const ringSize = size === 'sm' ? 'size-5' : 'size-6'

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-all duration-200',
        ringSize,
        isUrgent ? 'bg-orange/10' : 'bg-bone-raised',
      )}
      aria-hidden="true"
    >
      <span className="relative flex items-center justify-center">
        {isThinking ? (
          <span className="flex items-center gap-0.5">
            <span className={cn(dotSize, 'rounded-full bg-orange relay-thinking-dot relay-thinking-dot-1')} />
            <span className={cn(dotSize, 'rounded-full bg-orange relay-thinking-dot relay-thinking-dot-2')} />
            <span className={cn(dotSize, 'rounded-full bg-orange relay-thinking-dot relay-thinking-dot-3')} />
          </span>
        ) : state === 'waiting' ? (
          <span className={cn(dotSize, 'rounded-full bg-stone gentle-pulse')} />
        ) : (
          <span
            className={cn(
              dotSize,
              'rounded-full transition-colors duration-200',
              isUrgent ? 'bg-orange gentle-pulse' : 'bg-bone-raised border border-line',
            )}
          />
        )}
      </span>
    </span>
  )
}

/**
 * RelayPresenceLabel — combines the glyph with a text label for inline use.
 */
export function RelayPresenceLabel({ state, label }: { state: RelayPresenceState; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <RelayPresence state={state} />
      <span className={cn(
        'text-[12px] font-medium transition-colors duration-200',
        state === 'needs_information' || state === 'ready' ? 'text-orange' : 'text-ink',
      )}>
        {label}
      </span>
    </span>
  )
}
