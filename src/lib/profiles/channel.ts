import type { RevenueIdentityChannel } from '@/lib/domain/types'

/**
 * Canonical channel for any stored or typed value. Production rows have always
 * been lowercase, but a hand-edited row or an imported identity must not make a
 * profile disappear from a channel surface — every surface compares through
 * this, so `UPWORK` and `upwork` are the same capability.
 *
 * Kept in a leaf module (no store/auth imports) so the canonical execution
 * scope can use it without a circular dependency.
 */
export function normalizeChannel(value: string | null | undefined): RevenueIdentityChannel {
  if (!value) return 'other'
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (key === 'linkedin' || key === 'linked_in') return 'linkedin'
  if (key === 'upwork' || key === 'up_work') return 'upwork'
  if (key === 'email' || key === 'e_mail') return 'email'
  return 'other'
}

/** The one channel-name authority. Never render a raw lowercase channel. */
export const CHANNEL_LABELS: Record<RevenueIdentityChannel, string> = {
  linkedin: 'LinkedIn',
  upwork: 'Upwork',
  email: 'Email',
  other: 'Other',
}

export function channelLabel(value: string | null | undefined): string {
  return CHANNEL_LABELS[normalizeChannel(value)]
}
