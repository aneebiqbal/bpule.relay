import { Globe, Mail, type LucideIcon } from 'lucide-react'
import { cn } from 'cn'
import { channelLabel, normalizeChannel } from '@/lib/profiles/channel'
import { LinkedInMark, UpworkMark } from '@/components/ui/channel-logo'
import type { RevenueIdentityChannel } from '@/lib/domain/types'

/**
 * The one channel badge. Real brand mark + text, never color alone, and never a
 * raw lowercase channel string — every surface that names a channel renders this.
 */

const CHANNEL_TONE: Record<RevenueIdentityChannel, string> = {
  linkedin: 'bg-cobalt/10 text-cobalt-ink',
  upwork: 'bg-status-success/10 text-status-success',
  email: 'bg-orange/10 text-orange-ink',
  other: 'bg-bone text-graphite',
}

const GENERIC_ICON: Record<Exclude<RevenueIdentityChannel, 'linkedin' | 'upwork'>, LucideIcon> = {
  email: Mail,
  other: Globe,
}

function ChannelMark({ channel, className }: { channel: RevenueIdentityChannel; className?: string }) {
  if (channel === 'linkedin') return <LinkedInMark className={className} />
  if (channel === 'upwork') return <UpworkMark className={className} />
  const Icon = GENERIC_ICON[channel]
  return <Icon className={cn(className, 'text-graphite')} aria-hidden="true" />
}

export function ChannelBadge({
  channel,
  className,
}: {
  channel: string | null | undefined
  className?: string
}) {
  const key = normalizeChannel(channel)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        CHANNEL_TONE[key],
        className,
      )}
    >
      <ChannelMark channel={key} className="size-2.5" />
      {channelLabel(channel)}
    </span>
  )
}
