import { describe, it, expect } from 'vitest'
import { createTasteProfile, applyTasteSignal, scoreTasteMatch, normalizeTerritory, computeSignalIdempotencyKey } from '@/lib/content/intelligence/v2/taste'

describe('Taste Signal Path: Territory Normalization', () => {
  it('normalizes territory keys to lowercase underscored form', () => {
    expect(normalizeTerritory('AI')).toBe('ai')
    expect(normalizeTerritory('Engineering Culture')).toBe('engineering_culture')
    expect(normalizeTerritory('  Human Observations  ')).toBe('human_observations')
    expect(normalizeTerritory('core-expertise')).toBe('core_expertise')
  })

  it('prevents territory fragmentation from case/space variants', () => {
    let tp = createTasteProfile('p1')
    tp = applyTasteSignal(tp, { type: 'write_this', territory: 'AI' })
    tp = applyTasteSignal(tp, { type: 'write_this', territory: 'ai' })
    tp = applyTasteSignal(tp, { type: 'write_this', territory: ' Ai ' })
    // All three should accumulate into a single 'ai' territory key
    expect(Object.keys(tp.territoryAffinity).length).toBe(1)
    expect(tp.territoryAffinity['ai']).toBeDefined()
    expect(tp.territoryAffinity['ai']).toBeGreaterThan(0.5)
  })
})

describe('Taste Signal Path: Idempotency', () => {
  it('computeSignalIdempotencyKey returns the explicit key when provided', () => {
    const key = computeSignalIdempotencyKey({ type: 'write_this', idempotencyKey: 'action:123' })
    expect(key).toBe('action:123')
  })

  it('computeSignalIdempotencyKey returns undefined when no key provided', () => {
    const key = computeSignalIdempotencyKey({ type: 'write_this' })
    expect(key).toBeUndefined()
  })
})

describe('Taste Signal Path: Signal Strength', () => {
  it('posting is stronger than write_this', () => {
    let tpWrite = createTasteProfile('p1')
    tpWrite = applyTasteSignal(tpWrite, { type: 'write_this', territory: 'ai', metadata: { wasTechnical: true } })

    let tpPost = createTasteProfile('p2')
    tpPost = applyTasteSignal(tpPost, { type: 'posting', territory: 'ai', metadata: { wasTechnical: true } })

    expect(tpPost.preferences.technicalVsHuman).toBeGreaterThan(tpWrite.preferences.technicalVsHuman)
    expect(tpPost.territoryAffinity['ai']).toBeGreaterThan(tpWrite.territoryAffinity['ai'])
  })

  it('not_for_me lowers territory affinity without poisoning unrelated territories', () => {
    let tp = createTasteProfile('p1')
    // Build affinity for 'ai'
    for (let i = 0; i < 3; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', territory: 'ai', metadata: { wasTechnical: true } })
    }
    const aiAffinityBefore = tp.territoryAffinity['ai']
    expect(aiAffinityBefore).toBeGreaterThan(0.5)

    // Reject an AI idea
    tp = applyTasteSignal(tp, { type: 'not_for_me', territory: 'ai', metadata: { wasTechnical: true } })
    expect(tp.territoryAffinity['ai']).toBeLessThan(aiAffinityBefore)

    // career territory should be unaffected
    expect(tp.territoryAffinity['career']).toBeUndefined()
  })

  it('not_for_me on technical lowers technical dimension', () => {
    let tp = createTasteProfile('p1')
    for (let i = 0; i < 5; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', metadata: { wasTechnical: true } })
    }
    const techBefore = tp.preferences.technicalVsHuman
    expect(techBefore).toBeGreaterThan(0)

    tp = applyTasteSignal(tp, { type: 'not_for_me', metadata: { wasTechnical: true } })
    expect(tp.preferences.technicalVsHuman).toBeLessThan(techBefore)
  })
})

describe('Taste Signal Path: Persona Isolation', () => {
  it('signals for persona A do not affect persona B', () => {
    let tpA = createTasteProfile('personaA')
    let tpB = createTasteProfile('personaB')

    for (let i = 0; i < 5; i++) {
      tpA = applyTasteSignal(tpA, { type: 'write_this', territory: 'ai', metadata: { wasTechnical: true } })
    }

    // Persona B should remain neutral
    expect(tpB.totalInteractions).toBe(0)
    expect(tpB.preferences.technicalVsHuman).toBe(0)
    expect(tpB.territoryAffinity).toEqual({})

    // Persona A should have learned
    expect(tpA.totalInteractions).toBe(5)
    expect(tpA.preferences.technicalVsHuman).toBeGreaterThan(0)
  })
})

describe('Taste Signal Path: Missing Territory Degrades Safely', () => {
  it('signal without territory still updates dimensional preferences', () => {
    let tp = createTasteProfile('p1')
    tp = applyTasteSignal(tp, { type: 'write_this', metadata: { wasOpinion: true } })
    expect(tp.preferences.opinionVsEducational).toBeGreaterThan(0)
    expect(tp.territoryAffinity).toEqual({})
  })

  it('signal with unknown territory creates normalized key', () => {
    let tp = createTasteProfile('p1')
    tp = applyTasteSignal(tp, { type: 'write_this', territory: 'Some New Territory' })
    expect(tp.territoryAffinity['some_new_territory']).toBeDefined()
    expect(tp.territoryAffinity['some_new_territory']).toBeGreaterThan(0.5)
  })
})

describe('Taste Signal Path: Short-term vs Long-term', () => {
  it('short-term weight decays when signals stop', () => {
    let tp = createTasteProfile('p1')
    tp = applyTasteSignal(tp, { type: 'write_this', metadata: { wasTechnical: true } })
    const weightAfterSignal = tp.shortTermWeight
    expect(weightAfterSignal).toBeGreaterThan(0)

    // Apply neutral signal to trigger decay
    tp = applyTasteSignal(tp, { type: 'ignored' })
    expect(tp.shortTermWeight).toBeLessThan(weightAfterSignal)
  })

  it('short-term dimensions drift toward long-term', () => {
    let tp = createTasteProfile('p1')
    for (let i = 0; i < 10; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', metadata: { wasTechnical: true } })
    }
    const shortBefore = tp.shortTerm.technicalVsHuman
    const longBefore = tp.preferences.technicalVsHuman

    for (let i = 0; i < 5; i++) {
      tp = applyTasteSignal(tp, { type: 'ignored' })
    }

    const shortAfter = tp.shortTerm.technicalVsHuman
    const longAfter = tp.preferences.technicalVsHuman
    expect(Math.abs(shortAfter - longAfter)).toBeLessThanOrEqual(Math.abs(shortBefore - longBefore) + 0.001)
  })
})

describe('Taste Signal Path: Deterministic Scenario', () => {
  it('neutral -> write_this -> reject -> write_this -> publish produces expected progression', () => {
    let tp = createTasteProfile('p1')
    const history: Array<{ step: string; interactions: number; tech: number; opinion: number; aiAffinity: number }> = []

    const snap = (step: string) => history.push({
      step,
      interactions: tp.totalInteractions,
      tech: Math.round(tp.preferences.technicalVsHuman * 1000) / 1000,
      opinion: Math.round(tp.preferences.opinionVsEducational * 1000) / 1000,
      aiAffinity: Math.round((tp.territoryAffinity['ai'] ?? 0.5) * 1000) / 1000,
    })

    snap('initial')

    // Step 1: write_this on a technical AI idea
    tp = applyTasteSignal(tp, {
      type: 'write_this',
      territory: 'ai',
      contentType: 'technical',
      metadata: { wasTechnical: true },
    })
    snap('after_write_this')

    expect(tp.totalInteractions).toBe(1)
    expect(tp.preferences.technicalVsHuman).toBeGreaterThan(0)
    expect(tp.territoryAffinity['ai']).toBeGreaterThan(0.5)

    // Step 2: not_for_me on a technical AI idea
    tp = applyTasteSignal(tp, {
      type: 'not_for_me',
      territory: 'ai',
      metadata: { wasTechnical: true },
    })
    snap('after_reject')

    expect(tp.totalInteractions).toBe(2)
    // technical preference should decrease from step 1
    expect(history[2].tech).toBeLessThan(history[1].tech)
    // ai affinity should decrease from step 1
    expect(history[2].aiAffinity).toBeLessThan(history[1].aiAffinity)

    // Step 3: write_this again on technical AI
    tp = applyTasteSignal(tp, {
      type: 'write_this',
      territory: 'ai',
      contentType: 'technical',
      metadata: { wasTechnical: true },
    })
    snap('after_second_write')

    expect(tp.totalInteractions).toBe(3)
    // technical should recover toward step 1 levels (but not exceed due to LR decay)
    expect(history[3].tech).toBeGreaterThan(history[2].tech)

    // Step 4: posting (strongest signal) on technical AI
    tp = applyTasteSignal(tp, {
      type: 'posting',
      territory: 'ai',
      contentType: 'technical',
      metadata: { wasTechnical: true },
    })
    snap('after_publish')

    expect(tp.totalInteractions).toBe(4)
    // posting should push technical higher than write_this alone
    expect(history[4].tech).toBeGreaterThan(history[3].tech)
    // ai affinity should be highest after publishing
    expect(history[4].aiAffinity).toBeGreaterThan(history[3].aiAffinity)

    // Verify career territory was never touched (unrelated territory isolation)
    expect(tp.territoryAffinity['career']).toBeUndefined()
  })
})

describe('Taste Signal Path: Score Matching', () => {
  it('scoreTasteMatch returns 0.5 when no interactions', () => {
    const tp = createTasteProfile('p1')
    expect(scoreTasteMatch(tp, { isTechnical: true })).toBe(0.5)
  })

  it('scoreTasteMatch rewards preferred territory', () => {
    let tp = createTasteProfile('p1')
    for (let i = 0; i < 5; i++) {
      tp = applyTasteSignal(tp, { type: 'write_this', territory: 'ai', metadata: { wasTechnical: true } })
    }
    const aiScore = scoreTasteMatch(tp, { isTechnical: true, territory: 'ai' })
    const noTerritoryScore = scoreTasteMatch(tp, { isTechnical: true })
    expect(aiScore).toBeGreaterThan(noTerritoryScore)
  })
})
