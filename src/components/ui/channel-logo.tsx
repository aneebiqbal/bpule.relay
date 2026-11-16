import { cn } from 'cn'
import { Globe, Mail, type LucideIcon } from 'lucide-react'
import { normalizeChannel } from '@/lib/profiles/channel'
import type { RevenueIdentityChannel } from '@/lib/domain/types'

/**
 * Brand marks for the two supported marketplaces, plus the generic channel
 * icons. Real logos where a brand exists (LinkedIn, Upwork), Lucide otherwise.
 * Sized on a single scale so a card's accounts line up.
 */

function LinkedInMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="5" fill="#0A66C2" />
      <path
        fill="#fff"
        d="M7.2 9.6H4.6V19h2.6V9.6zM5.9 8.4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM19.4 13.4c0-2.5-1.3-3.9-3.3-3.9-1.3 0-2 .7-2.4 1.3V9.6H11V19h2.6v-4.9c0-1.1.4-1.9 1.4-1.9 1 0 1.4.8 1.4 1.9V19h2.6l.4-5.6z"
      />
    </svg>
  )
}

function UpworkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="5" fill="#14A800" />
      <path
        fill="#fff"
        d="M8.1 7.5c1.7 0 3 1.2 3 3.3l.3 1.6c.2 1 .7 1.5 1.5 1.5.9 0 1.4-.8 1.4-2V7.6h2.5v4.5c0 2.1-1.2 3.6-3.2 3.6-1.2 0-2.1-.5-2.7-1.4l-.1 1.2H8.9V9.9c0-1.3-.8-2.4-2.2-2.4H6.5V16H4.6V7.5h3.5z"
      />
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
