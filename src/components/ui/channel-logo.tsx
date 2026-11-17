import { cn } from 'cn'
import { Globe, Mail, type LucideIcon } from 'lucide-react'
import { normalizeChannel } from '@/lib/profiles/channel'
import type { RevenueIdentityChannel } from '@/lib/domain/types'

/**
 * Brand marks for the two supported marketplaces, plus the generic channel
 * icons. Real logos where a brand exists (LinkedIn, Upwork), Lucide otherwise.
 * Sized on a single scale so a card's accounts line up.
 */

const LINKEDIN_PATH =
  'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'

const UPWORK_PATH =
  'M18.561 13.158c-1.102 0-2.135-.467-3.074-1.227l.228-1.076.008-.042c.207-1.143.849-3.06 2.839-3.06 1.492 0 2.703 1.212 2.703 2.703-.001 1.489-1.212 2.702-2.704 2.702zm0-8.14c-2.539 0-4.51 1.649-5.31 4.366-1.22-1.834-2.148-4.036-2.687-5.892H7.828v7.112c-.002 1.406-1.141 2.546-2.547 2.548-1.405-.002-2.543-1.143-2.545-2.548V3.492H0v7.112c0 2.914 2.37 5.303 5.281 5.303 2.913 0 5.283-2.389 5.283-5.303v-1.19c.529 1.107 1.182 2.229 1.974 3.221l-1.673 7.873h2.797l1.213-5.71c1.063.679 2.285 1.109 3.686 1.109 3 0 5.439-2.452 5.439-5.45 0-3-2.439-5.439-5.439-5.439z'

/** Official LinkedIn glyph (Simple Icons), drawn as the brand rounded square. */
export function LinkedInMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path fill="#0A66C2" d={LINKEDIN_PATH} />
    </svg>
  )
}

/** Official Upwork glyph (Simple Icons), in the brand green. */
export function UpworkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path fill="#6FDA44" d={UPWORK_PATH} />
    </svg>
  )
}

const GENERIC_ICON: Record<Exclude<RevenueIdentityChannel, 'linkedin' | 'upwork'>, LucideIcon> = {
  email: Mail,
  other: Globe,
}

export function ChannelLogo({
  channel,
  className,
}: {
  channel: string | null | undefined
  className?: string
}) {
  const key = normalizeChannel(channel)
  if (key === 'linkedin') return <LinkedInMark className={cn('size-4 shrink-0', className)} />
  if (key === 'upwork') return <UpworkMark className={cn('size-4 shrink-0', className)} />
  const Icon = GENERIC_ICON[key]
  return <Icon className={cn('size-4 shrink-0 text-graphite', className)} aria-hidden="true" />
}
