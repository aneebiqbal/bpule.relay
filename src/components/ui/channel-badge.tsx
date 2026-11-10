import { Briefcase, Globe, Mail, Users, type LucideIcon } from 'lucide-react'
import { cn } from 'cn'
import { channelLabel, normalizeChannel } from '@/lib/profiles/channel'
import type { RevenueIdentityChannel } from '@/lib/domain/types'

/**
 * The one channel badge. Icon + text, never color alone, and never a raw
 * lowercase channel string — every surface that names a channel renders this.
 */
const CHANNEL_ICON: Record<RevenueIdentityChannel, LucideIcon> = {
  linkedin: Users,
  upwork: Briefcase,
  email: Mail,
  other: Globe,
}

const CHANNEL_TONE: Record<RevenueIdentityChannel, string> = {
  linkedin: 'bg-cobalt/10 text-cobalt-light',
  upwork: 'bg-status-success/10 text-status-success',
  email: 'bg-orange/10 text-orange-ink',
  other: 'bg-bone text-graphite',
}

export function ChannelBadge({
  channel,
  className,
}: {
  channel: string | null | undefined
  className?: string
}) {
  const key = normalizeChannel(channel)
  const Icon = CHANNEL_ICON[key]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        CHANNEL_TONE[key],
        className,
      )}
    >
      <Icon className="size-2.5" aria-hidden="true" />
      {channelLabel(channel)}
    </span>
  )
}
