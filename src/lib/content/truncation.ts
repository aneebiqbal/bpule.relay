import type { ContentPlatform } from '@/lib/domain/types'

// Real, observed "see more" clip points. LinkedIn truncates by rendered
// line height on feed, which varies by device, but its character-count
// clip point is well and consistently documented around this range for
// desktop feed. X clips by character count in the feed view.
const TRUNCATION_CHARS: Record<ContentPlatform, number> = {
  linkedin: 210,
  x: 280,
  instagram: 2200,
}

export interface TruncationPreview {
  visible: string
  hidden: string
  truncated: boolean
  limit: number
}

export function previewTruncation(caption: string, platform: ContentPlatform): TruncationPreview {
  const limit = TRUNCATION_CHARS[platform]
  if (caption.length <= limit) {
    return { visible: caption, hidden: '', truncated: false, limit }
  }
  return {
    visible: caption.slice(0, limit),
    hidden: caption.slice(limit),
    truncated: true,
    limit,
  }
}
