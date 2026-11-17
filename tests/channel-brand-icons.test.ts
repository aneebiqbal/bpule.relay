import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('CHANNEL_BRAND_ICONS', () => {
  const logo = read('src/components/ui/channel-logo.tsx')
  const badge = read('src/components/ui/channel-badge.tsx')

  it('draws the official LinkedIn and Upwork marks, not generic Lucide icons', () => {
    expect(logo).toContain('#0A66C2')
    expect(logo).toContain('#6FDA44')
    expect(logo).toContain('M20.447 20.452h-3.554')
    expect(logo).toContain('M18.561 13.158c-1.102')
    expect(logo).not.toContain('Briefcase')
  })

  it('the one channel badge uses the brand marks', () => {
    expect(badge).toContain('LinkedInMark')
    expect(badge).toContain('UpworkMark')
    expect(badge).toContain('channelLabel')
  })

  it('profile surfaces name a channel through the badge, not a raw string', () => {
    const surfaces = [
      'src/components/team/team-command-center.tsx',
      'src/components/team/person-profiles-workspace.tsx',
      'src/components/shell/profile-switcher.tsx',
      'src/components/coverage/manage-people-dialog.tsx',
      'src/components/rep/responsibility-workspace-detail.tsx',
    ]
    for (const surface of surfaces) {
      expect(read(surface), surface).toContain('ChannelBadge')
    }
  })
})
