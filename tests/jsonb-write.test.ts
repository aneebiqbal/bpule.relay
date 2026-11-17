import { describe, expect, it } from 'vitest'
import { writeValue } from '@/lib/db/neon'

/**
 * The Postgres/Neon drivers serialize a JS array as a Postgres array literal,
 * which is invalid JSON. Every jsonb column must therefore be stringified at
 * the builder boundary — profile creation used to fail with
 * "invalid input syntax for type json" because it did not.
 */
describe('JSONB_WRITE_SERIALIZATION', () => {
  it('stringifies arrays and objects bound for jsonb columns', () => {
    expect(writeValue('profiles', 'primary_skills', ['React', 'Node'])).toBe('["React","Node"]')
    expect(writeValue('profiles', 'communication_style', { tone: 'direct' })).toBe('{"tone":"direct"}')
    expect(writeValue('profiles', 'ai_context', {})).toBe('{}')
    expect(writeValue('profile_sources', 'detected_people', [{ name: 'A' }])).toBe('[{"name":"A"}]')
  })

  it('leaves an already-serialized string untouched', () => {
    expect(writeValue('profiles', 'primary_skills', '["React"]')).toBe('["React"]')
  })

  it('writes null for missing jsonb values', () => {
    expect(writeValue('profiles', 'primary_skills', null)).toBeNull()
    expect(writeValue('profiles', 'primary_skills', undefined)).toBeNull()
  })

  it('does not touch the same column name on a table where it is not jsonb', () => {
    // `skills` is jsonb on profiles/revenue_identities but a real array on
    // portfolio_projects; `detected_people` is jsonb on profile_sources but an
    // integer on profile_import_batches.
    expect(writeValue('portfolio_projects', 'skills', ['React'])).toEqual(['React'])
    expect(writeValue('portfolio_projects', 'technologies', ['Node'])).toEqual(['Node'])
    expect(writeValue('profile_import_batches', 'detected_people', 3)).toBe(3)
    expect(writeValue('content_profiles', 'technologies', ['SaaS'])).toBe('["SaaS"]')
  })
})
