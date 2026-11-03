import { describe, expect, it } from 'vitest'
import { stageRatioPct, withConversion } from '@/lib/operations/reports'

/**
 * Stage counts are snapshots, not transitions. Filters, history and re-entry
 * make a later stage hold more rows than its predecessor, so a ratio above
 * 100% is not a conversion rate and must never render as "1413%".
 */
describe('V3_PIPELINE_CONVERSION_SEMANTICS', () => {
  it('returns null when the denominator cannot support a ratio', () => {
    expect(stageRatioPct(null, 10)).toBeNull()
    expect(stageRatioPct(5, null)).toBeNull()
    expect(stageRatioPct(5, 0)).toBeNull()
    expect(stageRatioPct(0, 0)).toBeNull()
  })

  it('keeps honest ratios and drops non-monotonic ones', () => {
    expect(stageRatioPct(19, 31)).toBe(61)
    expect(stageRatioPct(31, 31)).toBe(100)
    expect(stageRatioPct(0, 31)).toBe(0)
    // Later stage holds more rows than the previous: not a conversion.
    expect(stageRatioPct(442, 31)).toBeNull()
    expect(stageRatioPct(1413, 100)).toBeNull()
  })

  it('withConversion leaves the first step unknown and suppresses absurd steps', () => {
    const steps = withConversion([
      { label: 'Qualified', count: 58 },
      { label: 'Contacted', count: 31 },
      { label: 'Conversation', count: 19 },
      { label: 'Rewound by filter', count: 442 },
    ])
    expect(steps.map((s) => s.conversionPct)).toEqual([null, 53, 61, null])
  })
})
