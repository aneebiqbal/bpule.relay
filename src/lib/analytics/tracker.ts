'use client'

/**
 * Minimal product instrumentation for UX behavior analysis.
 *
 * This is NOT the Action Ledger (business truth).
 * This tracks UI behavior: clicks, timing, funnel progression.
 *
 * Events are fire-and-forge t. Failures are silently ignored.
 */

type AnalyticsEvent =
  | 'home_opened'
  | 'prospect_analysis_started'
  | 'prospect_analysis_completed'
  | 'lead_saved'
  | 'connection_generated'
  | 'connection_sent'
  | 'dm_generated'
  | 'dm_sent'
  | 'reply_received'
  | 'reply_sent'
  | 'followup_completed'
  | 'lead_referred'
  | 'lead_archived'
  | 'upwork_started'
  | 'upwork_applied'
  | 'resume_work_opened'
  | 'quick_action_used'
  | 'search_performed'

interface AnalyticsPayload {
  event: AnalyticsEvent
  leadId?: string
  jobId?: string
  channel?: string
  durationMs?: number
  metadata?: Record<string, string | number | boolean>
}

export function trackEvent(payload: AnalyticsPayload): void {
  if (typeof window === 'undefined') return

  try {
    const body = JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
      sessionId: getSessionId(),
    })

    // Use sendBeacon for reliability during page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/track', new Blob([body], { type: 'application/json' }))
    } else {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // Silently ignore analytics failures
  }
}

let _sessionId: string | null = null

function getSessionId(): string {
  if (_sessionId) return _sessionId
  try {
    _sessionId = sessionStorage.getItem('relay-session-id')
    if (!_sessionId) {
      _sessionId = crypto.randomUUID()
      sessionStorage.setItem('relay-session-id', _sessionId)
    }
  } catch {
    _sessionId = `session-${Date.now()}`
  }
  return _sessionId
}

/**
 * Track time between two events. Use for funnel timing.
 */
export function startTiming(eventName: AnalyticsEvent): { end: (metadata?: Record<string, string | number | boolean>) => void } {
  const start = performance.now()
  return {
    end: (metadata) => {
      const durationMs = Math.round(performance.now() - start)
      trackEvent({ event: eventName, durationMs, metadata })
    },
  }
}
