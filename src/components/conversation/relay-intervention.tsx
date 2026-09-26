'use client'

import { cn } from 'cn'
import { AlertTriangle, Lightbulb } from 'lucide-react'
import { RelayPresence, type RelayPresenceState } from './relay-presence'

interface RelayInterventionProps {
  state: RelayPresenceState
  children: React.ReactNode
  variant?: 'default' | 'warning' | 'insight'
  onDismiss?: () => void
}

/**
 * RelayIntervention — Relay commentary that appears only when useful.
 *
 * NOT between every message. Only when:
 * - client replied
 * - context missing
 * - risk detected
 * - next action available
 * - conversation changed commercially
 * - user asks for another response
 */
export function RelayIntervention({ state, children, variant = 'default' }: RelayInterventionProps) {
  return (
    <div className={cn(
      'message-entrance flex justify-start',
    )}>
      <div className={cn(
        'max-w-[85%] rounded-md border px-3.5 py-2.5',
        variant === 'warning' ? 'border-status-warning/20 bg-status-warning/5' :
        variant === 'insight' ? 'border-cobalt/20 bg-cobalt/5' :
        'border-line bg-bone-raised/40',
      )}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <RelayPresence state={state} />
          <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Relay</span>
        </div>
        <div className="text-[13px] leading-relaxed text-ink">
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * RelayClaimWarning — shows when a claim was removed for safety.
 */
export function RelayClaimWarning({ reason, onSeeWhy }: { reason: string; onSeeWhy?: () => void }) {
  return (
    <RelayIntervention state="ready" variant="warning">
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
        <span>{reason}</span>
      </p>
      {onSeeWhy && (
        <button
          type="button"
          onClick={onSeeWhy}
          className="mt-2 text-[11px] text-graphite underline-offset-2 hover:text-ink hover:underline"
        >
          See why
        </button>
      )}
    </RelayIntervention>
  )
}

/**
 * RelayPositiveSignal — client showing buying intent.
 */
export function RelayPositiveSignal({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <RelayIntervention state="ready" variant="insight">
      <p className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-cobalt" />
        <span>{message}</span>
      </p>
      {action && <div className="mt-2">{action}</div>}
    </RelayIntervention>
  )
}

/**
 * RelayObjective — shows the conversation goal above/beside the draft.
 */
export function RelayObjective({ goal }: { goal: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-bone-raised/30 px-3 py-2 border border-line">
      <span className="text-[10px] uppercase tracking-[0.12em] text-stone">Goal</span>
      <span className="text-[12px] text-ink">{goal}</span>
    </div>
  )
}
