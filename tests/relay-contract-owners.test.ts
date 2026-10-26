/**
 * Dead contract owner scan (Phase 32).
 *
 * A canonical owner that nothing consumes is a contract that has been replaced
 * by a hidden secondary implementation. This asserts every contract owner is
 * still imported by at least one runtime consumer, and that no "V2" variant of
 * a contract owner exists outside an intentional contract change.
 *
 * This is an architecture test, so it reads source. It does not assert behavior.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.join(process.cwd(), 'src')

function allSourceFiles(dir: string = SRC): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...allSourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const FILES = allSourceFiles()

function consumersOf(symbol: string, ownerFile: string): string[] {
  const ownerBase = path.basename(ownerFile)
  return FILES.filter((file) => {
    if (path.basename(file) === ownerBase) return false
    if (file.includes('.test.')) return false
    return readFileSync(file, 'utf8').includes(symbol)
  }).map((file) => path.relative(process.cwd(), file))
}

interface Owner {
  symbol: string
  file: string
}

const OWNERS: Owner[] = [
  { symbol: 'deriveNextLeadAction', file: 'src/lib/relay/lead-state-machine.ts' },
  { symbol: 'deriveConversationPresence', file: 'src/lib/relay/conversation-presence.ts' },
  { symbol: 'deriveRelationshipDisplayState', file: 'src/lib/relay/conversation-presence.ts' },
  { symbol: 'derivePipelineStage', file: 'src/components/leads/pipeline-utils.ts' },
  { symbol: 'getLeadDisplayScore', file: 'src/lib/scoring/display-score.ts' },
  { symbol: 'deriveTodayCounts', file: 'src/lib/relay/today-counts.ts' },
  { symbol: 'separateRoleFromEmployer', file: 'src/lib/intelligence-v2/extraction-pipeline.ts' },
  { symbol: 'resolveVerifiedBuyerIntent', file: 'src/lib/intelligence-v3/buyer-intent.ts' },
  { symbol: 'imageRegenerationOutcome', file: 'src/lib/content/image-failure.ts' },
  { symbol: 'extractBuyerRequests', file: 'src/lib/relay/buyer-request-plan.ts' },
]

describe('contract owners are consumed', () => {
  it.each(OWNERS)('$symbol has a runtime consumer', ({ symbol, file }) => {
    const consumers = consumersOf(symbol, file)
    expect(consumers, `${symbol} is defined in ${file} but nothing consumes it`).not.toEqual([])
  })
})

describe('no hidden secondary implementation', () => {
  const FORBIDDEN = [
    'deriveTodayCountsV2',
    'calculateTodayCounts',
    'deriveNextLeadActionV2',
    'computeLeadAction',
    'derivePipelineStageV2',
    'getLeadDisplayScoreV2',
    'resolveBuyerIntentV2',
    'extractBuyerQuestionsV2',
  ]

  it.each(FORBIDDEN)('$0 does not exist in src', (symbol) => {
    const offenders = FILES.filter((file) => readFileSync(file, 'utf8').includes(symbol))
    expect(offenders, `${symbol} looks like a hidden secondary implementation`).toEqual([])
  })
})
