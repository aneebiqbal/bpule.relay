export type ChannelType = 'dm' | 'connection' | 'upwork' | 'email'
export type ConversationStage = 'new' | 'contacted' | 'replied' | 'followed_up' | 'won' | 'lost'

export interface TimingInput {
  channel: ChannelType
  prospectTimezone: string | null
  repTimezone: string
  lastMeaningfulActionAt: string | null
  conversationStage: ConversationStage
  connectionAccepted: boolean
  replyReceived: boolean
  followupCount: number
  workingDay: boolean
  workingHoursStart: number
  workingHoursEnd: number
  lastReplyAt: string | null
  lastFollowupAt: string | null
}

export interface TimingOutput {
  earliestActionAt: string | null
  recommendedActionAt: string | null
  latestActionAt: string | null
  nextActionType: string
  reason: string
  prospectLocalTime: string | null
  repLocalTime: string
  timingConfidence: 'high' | 'medium' | 'low'
  status: 'NOT_YET' | 'READY_NOW' | 'DUE' | 'OVERDUE' | 'WAITING' | 'REPLY_NEEDED'
}

const FOLLOWUP_WINDOW_HOURS = 24
const CONNECTION_ACCEPT_WINDOW_HOURS = 4
const REPLY_WINDOW_HOURS = 2

export function calculateContactWindow(input: TimingInput): TimingOutput {
  const now = new Date()
  const prospectOffset = input.prospectTimezone ? getOffsetHours(input.prospectTimezone) : null
  const repOffset = getOffsetHours(input.repTimezone)

  let prospectLocalTime: string | null = null
  if (input.prospectTimezone) {
    try {
      prospectLocalTime = now.toLocaleTimeString('en-US', {
        timeZone: input.prospectTimezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    } catch { /* empty */ }
  }

  const repLocalTime = now.toLocaleTimeString('en-US', {
    timeZone: input.repTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  if (input.conversationStage === 'won' || input.conversationStage === 'lost') {
    return {
      earliestActionAt: null,
      recommendedActionAt: null,
      latestActionAt: null,
      nextActionType: 'none',
      reason: 'Deal is closed',
      prospectLocalTime,
      repLocalTime,
      timingConfidence: 'high',
      status: 'NOT_YET',
    }
  }

  if (input.replyReceived) {
    return {
      earliestActionAt: now.toISOString(),
      recommendedActionAt: now.toISOString(),
      latestActionAt: new Date(now.getTime() + REPLY_WINDOW_HOURS * 3600000).toISOString(),
      nextActionType: 'reply',
      reason: 'Client replied - respond now',
      prospectLocalTime,
      repLocalTime,
      timingConfidence: 'high',
      status: 'REPLY_NEEDED',
    }
  }

  if (input.lastMeaningfulActionAt && !input.connectionAccepted) {
    const lastAction = new Date(input.lastMeaningfulActionAt)
    const windowMs = input.channel === 'connection' ? CONNECTION_ACCEPT_WINDOW_HOURS * 3600000 : FOLLOWUP_WINDOW_HOURS * 3600000
    const dueAt = lastAction.getTime() + windowMs
    const dueDate = new Date(dueAt)
    const nowMs = now.getTime()

    if (dueAt <= nowMs && input.conversationStage !== 'replied') {
      return {
        earliestActionAt: now.toISOString(),
        recommendedActionAt: now.toISOString(),
        latestActionAt: null,
        nextActionType: input.followupCount > 0 ? 'followup' : 'dm',
        reason: 'Follow-up window is open',
        prospectLocalTime,
        repLocalTime,
        timingConfidence: 'high',
        status: 'DUE',
      }
    }

    if (dueAt > nowMs) {
      const scheduledTime = input.prospectTimezone
        ? formatTimeInTimezone(dueDate, input.prospectTimezone)
        : dueDate.toISOString()

      return {
        earliestActionAt: null,
        recommendedActionAt: null,
        latestActionAt: null,
        nextActionType: 'waiting',
        reason: `Scheduled for ${scheduledTime} - waiting`,
        prospectLocalTime,
        repLocalTime,
        timingConfidence: prospectOffset !== null ? 'high' : 'medium',
        status: 'WAITING',
      }
    }
  }

  if (input.conversationStage === 'contacted' && input.followupCount === 0 && input.lastMeaningfulActionAt) {
    return {
      earliestActionAt: null,
      recommendedActionAt: null,
      latestActionAt: null,
      nextActionType: 'followup',
      reason: 'First follow-up available when due',
      prospectLocalTime,
      repLocalTime,
      timingConfidence: prospectOffset !== null ? 'high' : 'medium',
      status: 'WAITING',
    }
  }

  if (input.conversationStage === 'new' || (input.conversationStage === 'contacted' && input.lastMeaningfulActionAt === null)) {
    return {
      earliestActionAt: now.toISOString(),
      recommendedActionAt: now.toISOString(),
      latestActionAt: null,
      nextActionType: input.channel === 'upwork' ? 'apply' : input.channel === 'connection' ? 'connection_note' : 'dm',
      reason: 'Ready to make first contact',
      prospectLocalTime,
      repLocalTime,
      timingConfidence: 'high',
      status: 'READY_NOW',
    }
  }

  return {
    earliestActionAt: null,
    recommendedActionAt: null,
    latestActionAt: null,
    nextActionType: 'none',
    reason: 'No action available',
    prospectLocalTime,
    repLocalTime,
    timingConfidence: 'low',
    status: 'NOT_YET',
  }
}

function getOffsetHours(timezone: string): number {
  const map: Record<string, number> = {
    'Asia/Karachi': 5,
    'America/New_York': -5,
    'America/Chicago': -6,
    'America/Denver': -7,
    'America/Los_Angeles': -8,
    'America/Toronto': -5,
    'Europe/London': 0,
    'Europe/Berlin': 1,
    'Europe/Paris': 1,
    'Asia/Dubai': 4,
    'Asia/Kolkata': 5.5,
    'Asia/Shanghai': 8,
    'Australia/Sydney': 10,
  }
  return map[timezone] ?? 0
}

function formatTimeInTimezone(date: Date, timezone: string): string {
  try {
    return date.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return date.toISOString()
  }
}

export function shouldCancelTimedAction(
  currentStatus: string,
  newEvent: 'reply_received' | 'client_replied' | 'outcome_recorded' | 'won' | 'lost',
): boolean {
  if (newEvent === 'client_replied' || newEvent === 'reply_received') {
    return true
  }
  if (newEvent === 'outcome_recorded' || newEvent === 'won' || newEvent === 'lost') {
    return true
  }
  return currentStatus === 'DUE' || currentStatus === 'WAITING'
}

export function isBusinessHours(timezone: string, date: Date = new Date()): boolean {
  try {
    const hour = parseInt(date.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }), 10)
    const day = date.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' })
    const isWeekend = day === 'Saturday' || day === 'Sunday'
    return !isWeekend && hour >= 9 && hour < 17
  } catch {
    return false
  }
}

export function getNextBusinessHourStart(timezone: string, date: Date = new Date()): Date {
  const d = new Date(date)
  d.setHours(9, 0, 0, 0)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  if (d.getDay() === 6) d.setDate(d.getDate() + 2)
  return d
}

export function calculateProspectLocalTime(prospectTimezone: string | null, repTimezone: string): {
  prospectTime: string | null
  repTime: string
  isProspectBusinessHours: boolean
  isRepBusinessHours: boolean
  overlapWindow: { start: string; end: string } | null
} {
  const now = new Date()

  let prospectTime: string | null = null
  let isProspectBusinessHours = false
  if (prospectTimezone) {
    try {
      prospectTime = now.toLocaleTimeString('en-US', {
        timeZone: prospectTimezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      isProspectBusinessHours = isBusinessHours(prospectTimezone, now)
    } catch { /* empty */ }
  }

  const repTime = now.toLocaleTimeString('en-US', {
    timeZone: repTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const isRepBusinessHours = isBusinessHours(repTimezone, now)

  let overlapWindow: { start: string; end: string } | null = null
  if (prospectTimezone && isProspectBusinessHours && isRepBusinessHours) {
    overlapWindow = { start: '09:00', end: '17:00' }
  }

  return { prospectTime, repTime, isProspectBusinessHours, isRepBusinessHours, overlapWindow }
}

export function rankActionsByPriority(actions: Array<{ status: string; priorityScore: number; recommendedActionAt: string | null }>): Array<{ status: string; priorityScore: number; recommendedActionAt: string | null }> {
  const statusRank: Record<string, number> = {
    'REPLY_NEEDED': 100,
    'OVERDUE': 90,
    'DUE': 80,
    'READY_NOW': 60,
    'WAITING': 30,
    'NOT_YET': 10,
  }

  return [...actions].sort((a, b) => {
    const rankA = statusRank[a.status] ?? 0
    const rankB = statusRank[b.status] ?? 0
    if (rankA !== rankB) return rankB - rankA
    return (b.priorityScore ?? 0) - (a.priorityScore ?? 0)
  })
}
