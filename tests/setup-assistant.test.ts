import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('SETUP_ASSISTANT_PRESETS', () => {
  const source = read('src/components/team/setup-assistant.tsx')

  it('offers one-tap presets so nothing has to be typed', () => {
    for (const label of ['Assign operators', 'Split targets 60/40', 'Set primary', 'Weekday schedule', 'Full setup']) {
      expect(source).toContain(label)
    }
  })

  it('has a structured builder that composes the request', () => {
    expect(source).toContain('composePreview')
    expect(source).toContain('Use this request')
    expect(source).toContain('splitAllocations')
  })

  it('presets produce a deterministic preview without calling the model', () => {
    const presetFn = source.slice(source.indexOf('function applyPreset'), source.indexOf('// ── Network'))
    expect(presetFn).toContain('composePreview')
    expect(presetFn).not.toContain('/api/team/setup/parse')
  })
})

describe('SETUP_ASSISTANT_APPLIES_SCHEDULES', () => {
  const source = read('src/components/team/setup-assistant.tsx')

  it('the describe apply path writes parsed schedules', () => {
    const apply = source.slice(source.indexOf('async function applyDescribe'))
    expect(apply).toContain('/schedules')
  })
})

describe('SETUP_PARSE_NAME_RESOLUTION', () => {
  const source = read('src/app/api/team/setup/parse/route.ts')

  it('strips the [id]/(full name) annotations the model echoes back', () => {
    expect(source).toContain('replace(/\\[[^\\]]*\\]/g')
    expect(source).toContain('replace(/\\([^)]*\\)/g')
  })

  it('resolves a profile through the channel mentioned in the request', () => {
    expect(source).toContain('channelFromText')
    expect(source).toContain('resolveProfile(row.profile, channel)')
  })

  it('teaches the model what a 60/40 split means and not to invent schedules', () => {
    expect(source).toContain('60% and 40% OF THE TARGET')
    expect(source).toContain('never invent one')
  })
})
