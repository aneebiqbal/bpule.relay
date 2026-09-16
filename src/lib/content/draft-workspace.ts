export type DraftWorkspacePlatform = 'linkedin' | 'x'

export function normalizeDraftWorkspacePlatform(platform: string): DraftWorkspacePlatform {
  return platform === 'x' ? 'x' : 'linkedin'
}

export function buildRegenerateRequest(variant: string, currentPlatform: string): {
  angle: string
  platform: DraftWorkspacePlatform
} {
  if (variant.startsWith('platform:')) {
    const requested = variant.replace('platform:', '').trim().toLowerCase()
    if (requested !== 'linkedin' && requested !== 'x') {
      throw new Error('This platform is not available for Studio drafts yet.')
    }
    return {
      angle: 'platform_shift',
      platform: requested,
    }
  }

  return {
    angle: variant,
    platform: normalizeDraftWorkspacePlatform(currentPlatform),
  }
}

export function draftBufferStorageKey(draftId: string): string {
  return `studio:draft-buffer:${draftId}`
}
