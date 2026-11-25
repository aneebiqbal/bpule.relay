/**
 * Server-side validation for the execution catalog admin API.
 *
 * No arbitrary expressions, SQL or scripts are accepted: every field is a
 * predefined enum, a bounded string or a number. The database CHECK
 * constraints remain the final guard.
 */

import {
  CHANNEL_TEMPLATES,
  COUNTING_MODES,
  EVIDENCE_POLICIES,
  OPERATION_MODES,
  type ChannelTemplate,
  type CountingMode,
  type EvidencePolicy,
  type OperationMode,
} from './activity-catalog'

export const CHANNEL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/
export const ACTIVITY_KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/

export interface ChannelDraft {
  slug: string
  name: string
  description: string | null
  template: ChannelTemplate
  operationMode: OperationMode
  identityRequirements: Record<string, unknown>
}

export interface ActivityDraft {
  key: string
  label: string
  description: string | null
  countingMode: CountingMode
  evidencePolicy: EvidencePolicy
  targetable: boolean
  effortMinutes: number
  recordingModes: string[]
  outcomeClass: string | null
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
}

function optionalString(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === '') return null
  return boundedString(value, max)
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function parseChannelDraft(body: Record<string, unknown>, forCreate: boolean): ParseResult<ChannelDraft> {
  const slug = boundedString(body.slug, 64)
  if (forCreate) {
    if (!slug) return { ok: false, error: 'A slug is required.' }
    if (!CHANNEL_SLUG_PATTERN.test(slug)) {
      return { ok: false, error: 'Slug must be lowercase letters, numbers and dashes (2–64 chars).' }
    }
  } else if (body.slug !== undefined) {
    return { ok: false, error: 'Channel slug is immutable.' }
  }

  const name = body.name === undefined ? null : boundedString(body.name, 120)
  if (body.name !== undefined && !name) return { ok: false, error: 'Name must be 1–120 characters.' }

  const template = oneOf<ChannelTemplate>(body.template, CHANNEL_TEMPLATES, 'custom')
  const operationMode = oneOf<OperationMode>(body.operationMode, OPERATION_MODES, 'manual_evidence')

  let identityRequirements: Record<string, unknown> = {}
  if (body.identityRequirements !== undefined) {
    if (body.identityRequirements === null || typeof body.identityRequirements !== 'object' || Array.isArray(body.identityRequirements)) {
      return { ok: false, error: 'identityRequirements must be an object.' }
    }
    identityRequirements = body.identityRequirements as Record<string, unknown>
  }

  return {
    ok: true,
    value: {
      slug: slug ?? '',
      name: name ?? '',
      description: optionalString(body.description, 500),
      template,
      operationMode,
      identityRequirements,
    },
  }
}

export function parseActivityDraft(body: Record<string, unknown>, forCreate: boolean): ParseResult<ActivityDraft> {
  const key = boundedString(body.key, 64)
  if (forCreate) {
    if (!key) return { ok: false, error: 'An activity key is required.' }
    if (!ACTIVITY_KEY_PATTERN.test(key)) {
      return { ok: false, error: 'Key must start with a letter and use lowercase letters, numbers and underscores (2–64 chars).' }
    }
  } else if (body.key !== undefined) {
    return { ok: false, error: 'Activity key is immutable.' }
  }

  const label = body.label === undefined ? null : boundedString(body.label, 120)
  if (body.label !== undefined && !label) return { ok: false, error: 'Label must be 1–120 characters.' }

  const countingMode = oneOf<CountingMode>(body.countingMode, COUNTING_MODES, 'unique_verified_event')
  const evidencePolicy = oneOf<EvidencePolicy>(body.evidencePolicy, EVIDENCE_POLICIES, 'internal_record')

  const rawEffort = body.effortMinutes === undefined ? 0 : Number(body.effortMinutes)
  const effortMinutes = Number.isFinite(rawEffort) ? Math.round(rawEffort) : NaN
  if (!Number.isFinite(effortMinutes) || effortMinutes < 0 || effortMinutes > 480) {
    return { ok: false, error: 'effortMinutes must be between 0 and 480.' }
  }

  let recordingModes: string[] = []
  if (body.recordingModes !== undefined) {
    if (!Array.isArray(body.recordingModes) || body.recordingModes.length > 8 || body.recordingModes.some((row) => typeof row !== 'string' || row.trim() === '')) {
      return { ok: false, error: 'recordingModes must be up to 8 non-empty strings.' }
    }
    recordingModes = body.recordingModes.map((row) => String(row).trim())
  }

  return {
    ok: true,
    value: {
      key: key ?? '',
      label: label ?? '',
      description: optionalString(body.description, 500),
      countingMode,
      evidencePolicy,
      targetable: boolean(body.targetable, false),
      effortMinutes,
      recordingModes,
      outcomeClass: optionalString(body.outcomeClass, 64),
    },
  }
}
