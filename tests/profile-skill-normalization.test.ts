import { describe, it, expect } from 'vitest'
import { normalizeSkill, normalizeSkills, mergeSkillLists, extractYearsExperience, inferSeniority } from '@/lib/profile-intelligence/skill-normalization'

describe('normalizeSkill', () => {
  it('normalizes common aliases', () => {
    expect(normalizeSkill('reactjs')).toBe('React')
    expect(normalizeSkill('React.js')).toBe('React')
    expect(normalizeSkill('React')).toBe('React')
    expect(normalizeSkill('nodejs')).toBe('Node.js')
    expect(normalizeSkill('typescript')).toBe('TypeScript')
    expect(normalizeSkill('postgresql')).toBe('PostgreSQL')
  })

  it('title-cases unknown skills', () => {
    expect(normalizeSkill('kotlin')).toBe('Kotlin')
    expect(normalizeSkill('rust')).toBe('Rust')
  })

  it('upper-cases short acronyms', () => {
    expect(normalizeSkill('go')).toBe('Go')
    expect(normalizeSkill('css')).toBe('CSS')
    expect(normalizeSkill('sql')).toBe('SQL')
  })
})

describe('normalizeSkills', () => {
  it('deduplicates aliases', () => {
    const result = normalizeSkills(['React', 'reactjs', 'React.js', 'Node.js', 'nodejs'])
    expect(result).toEqual(['React', 'Node.js'])
  })

  it('filters out single characters', () => {
    const result = normalizeSkills(['React', 'a', 'Node.js', 'x'])
    expect(result).toEqual(['React', 'Node.js'])
  })
})

describe('mergeSkillLists', () => {
  it('merges without duplicating aliases', () => {
    const result = mergeSkillLists(['React', 'Node.js'], ['reactjs', 'TypeScript'])
    expect(result).toEqual(['React', 'Node.js', 'TypeScript'])
  })

  it('preserves existing order', () => {
    const result = mergeSkillLists(['Python', 'Django'], ['Flask'])
    expect(result).toEqual(['Python', 'Django', 'Flask'])
  })
})

describe('extractYearsExperience', () => {
  it('extracts from standard format', () => {
    expect(extractYearsExperience('5+ years of experience')).toBe(5)
    expect(extractYearsExperience('10 years experience')).toBe(10)
  })

  it('extracts from alternative format', () => {
    expect(extractYearsExperience('Experience: 7+ years')).toBe(7)
  })

  it('returns null when not stated', () => {
    expect(extractYearsExperience('Senior developer with expertise in React')).toBeNull()
  })

  it('rejects unreasonable values', () => {
    expect(extractYearsExperience('100 years of experience')).toBeNull()
  })
})

describe('inferSeniority', () => {
  it('infers from years of experience', () => {
    expect(inferSeniority(1, null)).toBe('junior')
    expect(inferSeniority(3, null)).toBe('mid')
    expect(inferSeniority(6, null)).toBe('senior')
    expect(inferSeniority(10, null)).toBe('lead')
    expect(inferSeniority(15, null)).toBe('principal')
  })

  it('infers from title when no years', () => {
    expect(inferSeniority(null, 'Junior Developer')).toBe('junior')
    expect(inferSeniority(null, 'Senior Engineer')).toBe('lead')
    expect(inferSeniority(null, 'CTO')).toBe('executive')
    expect(inferSeniority(null, 'VP of Engineering')).toBe('executive')
    expect(inferSeniority(null, 'Staff Engineer')).toBe('principal')
  })

  it('returns null when no data', () => {
    expect(inferSeniority(null, null)).toBeNull()
  })
})
