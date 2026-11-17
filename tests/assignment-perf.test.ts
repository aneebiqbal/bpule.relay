import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

/**
 * Assignment latency is dominated by round trips (~970 ms each on this host),
 * so the chain mutation must stay a single statement. These assertions fail if
 * anyone reintroduces a per-seat loop in the write path.
 */
describe('ASSIGNMENT_WRITE_ROUND_TRIPS', () => {
  it('configureCoverage delegates to the single-statement writer', () => {
    const actions = read('src/lib/coverage/actions.ts')
    expect(actions).toContain('configureCoverageStatement')
  })

  it('the statement does the whole chain without a per-seat acknowledgement loop', () => {
    const configure = read('src/lib/coverage/configure.ts')
    expect(configure).toContain('ack_ins')
    expect(configure).toContain('ack_arm')
    expect(configure).not.toMatch(/for \(const .* of .*\)[\s\S]{0,80}ensureOperatorAcknowledgement/)
  })

  it('the statement writes exactly one coverage event for the chain', () => {
    const configure = read('src/lib/coverage/configure.ts')
    expect(configure.match(/INSERT INTO coverage_events/g)?.length).toBe(1)
  })
})
