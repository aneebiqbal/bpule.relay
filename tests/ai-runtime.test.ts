import { describe, it, expect } from 'vitest'
import { extractAssistantText, extractDeltaText } from '@/lib/ai/runtime/normalize'

describe('assistant text extraction', () => {
  it('prefers content, then reasoning fields used by Groq gpt-oss', () => {
    expect(extractAssistantText({ content: '{"ok":true}', reasoning: 'thinking' })).toBe('{"ok":true}')
    expect(extractAssistantText({ content: '', reasoning: '{"ok":true}' })).toBe('{"ok":true}')
    expect(extractAssistantText({ reasoning_content: '{"ok":true}' })).toBe('{"ok":true}')
    expect(extractAssistantText({ content: '' })).toBe('')
  })

  it('splits stream deltas into content vs reasoning', () => {
    expect(extractDeltaText({ content: 'hello' })).toEqual({ content: 'hello', reasoning: '' })
    expect(extractDeltaText({ reasoning: 'think' })).toEqual({ content: '', reasoning: 'think' })
  })
})
