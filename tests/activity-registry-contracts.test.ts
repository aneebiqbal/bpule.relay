/**
 * V6.1 activity registry contracts.
 *
 * One registry defines every countable action. One real action maps to exactly
 * one activity key. Every targetable lane has exactly one completion authority.
 * Tracked is not the same as targetable.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ACTIVITY_REGISTRY,
  activityKeyForEventType,
  activityLabel,
  INTERNAL_EVENT_TYPES,
  targetableActivitiesForChannel,
  type ActivityKey,
} from '@/lib/responsibility/activity-registry'

const ALL = Object.values(ACTIVITY_REGISTRY)

describe('EVERY_TARGET_HAS_COMPLETION_AUTHORITY', () => {
  it('every targetable activity names exactly one authority', () => {
    for (const row of ALL.filter((entry) => entry.targetable)) {
      expect(row.completionAuthority, row.key).toBeTruthy()
      expect(row.completionAuthority, row.key).not.toContain(';')
    }
  })

  it('no two targetable lanes share a completion authority unless they are the same action', () => {
    const byAuthority = new Map<string, ActivityKey[]>()
    for (const row of ALL.filter((entry) => entry.targetable)) {
      const list = byAuthority.get(row.completionAuthority) ?? []
      list.push(row.key)
      byAuthority.set(row.completionAuthority, list)
    }
    for (const [authority, keys] of byAuthority) {
      expect(new Set(keys).size, `${authority} → ${keys.join(', ')}`).toBe(1)
    }
  })
})

describe('TRACKED_ACTION_NOT_ALWAYS_TARGETABLE', () => {
  it('generating a draft is tracked but is not a default target', () => {
    expect(ACTIVITY_REGISTRY.proposal_generated.targetable).toBe(false)
    expect(ACTIVITY_REGISTRY.proposal_generated.completionAuthority).toContain('UPWORK_PROPOSAL_PREPARED')
  })

  it('submitting an application is the targetable action', () => {
    expect(ACTIVITY_REGISTRY.application_submitted.targetable).toBe(true)
    expect(ACTIVITY_REGISTRY.application_submitted.completionAuthority).toBe(
      'upwork_applications.submitted_at',
    )
  })

  it('internal recommendation events are not activities at all', () => {
    for (const eventType of INTERNAL_EVENT_TYPES) {
      expect(activityKeyForEventType(eventType), eventType).toBeNull()
    }
  })
})

describe('ONE_EXECUTION_EVENT_ONE_CREDIT', () => {
  it('each (source event type, channel) pair resolves to exactly one activity key', () => {
    const seen = new Map<string, ActivityKey>()
    for (const row of ALL) {
      const channel = row.sourceChannel ?? row.channel
      for (const eventType of row.sourceEventTypes) {
        const key = `${eventType}@${channel}`
        expect(seen.has(key), `${key} mapped twice`).toBe(false)
        seen.set(key, row.key)
      }
    }
  })

  it('shared event types resolve by channel', () => {
    expect(activityKeyForEventType('FOLLOWUP_SENT', 'linkedin')).toBe('followup_sent')
    expect(activityKeyForEventType('FOLLOWUP_SENT', 'email')).toBe('email_followup_sent')
    expect(activityKeyForEventType('REPLY_SENT', 'linkedin')).toBe('reply_handled')
    expect(activityKeyForEventType('REPLY_SENT', 'email')).toBe('email_reply_handled')
    // Unambiguous types resolve without a channel.
    expect(activityKeyForEventType('CONNECTION_SENT')).toBe('connection_sent')
  })

  it('the Upwork label swap cannot recur', () => {
    expect(activityLabel('application_submitted')).toBe('Applications')
    expect(activityLabel('proposal_generated')).toBe('Drafts generated')
    expect(ACTIVITY_REGISTRY.application_submitted.channel).toBe('upwork')
    expect(ACTIVITY_REGISTRY.proposal_generated.channel).toBe('upwork')
  })

  it('a submission event never maps to the draft lane', () => {
    expect(activityKeyForEventType('UPWORK_APPLICATION_SUBMITTED')).toBe('application_submitted')
    expect(activityKeyForEventType('UPWORK_PROPOSAL_PREPARED')).toBe('proposal_generated')
  })
})

describe('UPWORK_APPLICATION_COUNTS_ON_SUBMISSION', () => {
  it('the completion authority is the submitted application row', () => {
    expect(ACTIVITY_REGISTRY.application_submitted.completionAuthority).toBe(
      'upwork_applications.submitted_at',
    )
  })
})

describe('UPWORK_LEGACY_EVENT_NORMALIZED_ONCE', () => {
  it('UPWORK_APPLIED is a legacy alias of UPWORK_APPLICATION_SUBMITTED, not a second action', () => {
    expect(activityKeyForEventType('UPWORK_APPLICATION_SUBMITTED')).toBe('application_submitted')
    expect(activityKeyForEventType('UPWORK_APPLIED')).toBe('application_submitted')
    // Both spellings resolve to ONE key — the registry holds one definition.
    const keys = ALL.filter((row) =>
      row.sourceEventTypes.includes('UPWORK_APPLIED') ||
      row.sourceEventTypes.includes('UPWORK_APPLICATION_SUBMITTED'),
    ).map((row) => row.key)
    expect(new Set(keys)).toEqual(new Set(['application_submitted']))
  })

  it('analytics dedupe the two spellings by job so neither is counted twice', () => {
    const source = readFileSync('src/lib/analytics/aggregates.ts', 'utf8')
    expect(source).toContain("action_type IN ('UPWORK_APPLIED', 'UPWORK_APPLICATION_SUBMITTED')")
    expect(source).toMatch(/COUNT\(DISTINCT job_id\) FILTER/)
    // The pre-normalization form counted only the legacy spelling.
    expect(source).not.toMatch(/COUNT\(\*\) FILTER \(WHERE action_type = 'UPWORK_APPLIED'\)/)
  })
})

describe('EMAIL_SEND_ATTRIBUTED', () => {
  it('an email send is targetable and has an authority', () => {
    expect(ACTIVITY_REGISTRY.email_sent.targetable).toBe(true)
    expect(ACTIVITY_REGISTRY.email_sent.channel).toBe('email')
    expect(ACTIVITY_REGISTRY.email_sent.completionAuthority).toContain('email')
  })

  it('email lanes appear in the email channel plan', () => {
    expect(targetableActivitiesForChannel('email').map((row) => row.key)).toContain('email_sent')
  })
})

describe('LINKEDIN_PACK_MATCHES_REGISTRY', () => {
  it('the LinkedIn pack is sourced from the registry, not a private copy', () => {
    const keys = targetableActivitiesForChannel('linkedin').map((row) => row.key)
    expect(keys).toEqual([
      'prospect_extracted',
      'connection_sent',
      'dm_sent',
      'followup_sent',
    ])
  })
})

describe('WEIGHTS_ARE_SECONDARY', () => {
  it('raw counts stay the truth; weights never replace them', () => {
    const source = readFileSync('src/lib/responsibility/activity-registry.ts', 'utf8')
    expect(source).toContain('defaultWeight')
    expect(source).toMatch(/Secondary analytics only/)
    // Every targetable lane keeps a raw label.
    for (const row of ALL.filter((entry) => entry.targetable)) {
      expect(row.label, row.key).toBeTruthy()
      expect(row.shortLabel, row.key).toBeTruthy()
    }
  })
})
