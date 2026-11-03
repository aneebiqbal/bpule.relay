import { describe, expect, it } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ExtractedLead } from '@/lib/domain/types'
import {
  PROSPECT_STATUS_LABELS,
  decisionLabelForScore,
  decisionWordFor,
  primaryActionFor,
  confidenceLabel,
  sourceLabelFor,
  relationshipLabel,
  prospectStatus,
  type ProspectStatus,
} from '@/lib/prospect/display'
import {
  ProspectCreated,
  ProspectLoadingSteps,
  ProspectResult,
  type ProspectResultProps,
} from '@/components/prospect/prospect-result'
import type { AnalysisState } from '@/components/prospect/prospect-analyze'

const render = (node: ReactElement) => renderToStaticMarkup(node)

// ── Fixtures ────────────────────────────────────────────────────────────────

function extracted(overrides: Partial<ExtractedLead> = {}): ExtractedLead {
  return {
    name: 'Atai Barkai',
    title: 'CEO',
    company: 'CopilotKit',
    url: 'https://www.linkedin.com/in/ataibarkai',
    signalType: 1,
    signalEvidence: 'CEO at CopilotKit',
    verbatimQuote: 'CEO at CopilotKit',
    tags: ['AWS', 'Redis'],
    ...overrides,
  }
}

/** Minimal AnalysisState. Tests override the slice they care about. */
function result(overrides: Partial<AnalysisState> = {}): AnalysisState {
  return {
    extracted: extracted(),
    score: {
      total: 52,
      displayScore: 5,
      label: 'Maybe — needs more signal',
      qualification: 'maybe',
      reasons: ['Decision-maker role', 'Strong technical/product relevance'],
      watchOut: ['No verified buyer request'],
      dimensions: [],
      missingInfo: [],
      calculation: null,
      decisionAdjustments: [],
    },
    inputStatus: null,
    inputHeadline: null,
    extractionCompleteness: { score: 80, missingFields: [] },
    canonical: {
      intelligence: { relationship: 'POTENTIAL_BUYER' },
      rawSource: { sourceType: 'linkedin_profile' },
    },
    bestSender: null,
    bestSenderProof: [],
    connectionNote: '',
    charCount: 0,
    maxChars: 300,
    quality: { passed: true, failures: [], wasRepaired: false },
    strategy: { whyConnect: '', relevantObservation: '', forbidden: [], candidateAngles: [] },
    alternativeSenders: [],
    senderRankings: [],
    senderSuggestion: null,
    draftFailed: false,
    demoMode: false,
    qualification: {} as AnalysisState['qualification'],
    revenue: {
      who: 'Atai Barkai',
      fit: 'MEDIUM',
      intent: 'UNKNOWN',
      confidence: 'MEDIUM',
      why: 'Service provider — not a buyer today.',
      act: 'CONNECT_OR_OBSERVE',
      reason: 'NO_CREDIBLE_REASON',
      nextAction: 'Keep on the watch list.',
      messageRecommended: false,
      noMessageReason: null,
      messageJob: null,
      messagingPolicy: 'OBSERVE',
      messagingPolicyLabel: 'Observe on connection',
    },
    decision: {
      recommendedAction: {
        action: 'OBSERVE',
        reason: 'Service provider — not a buyer today.',
        messageEligible: false,
        coldAction: '',
        conversationOverride: false,
        routing: { recommendation: 'KEEP', reason: null, delta: null },
      },
      routingRecommendation: null,
      confidenceDetail: { label: 'MEDIUM', reasons: [], researchMore: true },
      rejectedSignals: [],
      resolved: null,
      versions: null,
      decisionRunId: null,
    },
    ...overrides,
  } as AnalysisState
}

function props(overrides: Partial<ProspectResultProps> = {}): ProspectResultProps {
  return {
    result: result(),
    profileName: 'Mehak LinkedIn',
    canSaveLead: true,
    onPrimaryAction: () => {},
    onReanalyze: () => {},
    onDismiss: () => {},
    onToggleDetails: () => {},
    showDetails: false,
    onToggleSource: () => {},
    showSource: false,
    rawInput: '',
    onSenderChange: () => {},
    ...overrides,
  }
}

// ── V3_PROSPECT_PRIMARY_ANALYZE ──────────────────────────────────────────────

describe('V3_PROSPECT_PRIMARY_ANALYZE', () => {
  it('labels the source input and keeps Analyze as the one primary action', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/components/prospect/prospect-analyze.tsx', import.meta.url), 'utf8'),
    )
    // The textarea has an accessible name and the analyze submit keeps its
    // exact accessible label (e2e contract: /^(Analyze|Re-analyze)$/).
    expect(src).toMatch(/htmlFor="prospect-source"/)
    expect(src).toMatch(/placeholder="Paste the LinkedIn profile here\.\.\."/)
    expect(src).toMatch(/'Re-analyze'/)
    expect(src).toMatch(/'Analyze'/)
  })
})

// ── V3_PROSPECT_EXTRACTION_VISIBLE ───────────────────────────────────────────

describe('V3_PROSPECT_EXTRACTION_VISIBLE', () => {
  it('renders the extracted profile before any scoring detail', () => {
    const html = render(createElement(ProspectResult, props()))
    const extraction = html.indexOf('Extracted profile')
    const scoring = html.indexOf('Show scoring details')
    expect(extraction).toBeGreaterThan(-1)
    expect(scoring).toBeGreaterThan(-1)
    expect(extraction).toBeLessThan(scoring)
  })

  it('shows canonical extracted fields and marks unknown ones as Not stated', () => {
    const html = render(
      createElement(
        ProspectResult,
        props({
          result: result({
            extracted: extracted({ name: null, locationRaw: null }),
          }),
        }),
      ),
    )
    expect(html).toContain('CEO')
    expect(html).toContain('CopilotKit')
    // Person and location are absent from the extraction — never invented.
    expect(html.match(/Not stated/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the raw source behind a collapsed disclosure', () => {
    const html = render(
      createElement(ProspectResult, props({ rawInput: 'UNIQUE_SOURCE_MARKER', showSource: false })),
    )
    expect(html).toContain('View original source')
    expect(html).not.toContain('UNIQUE_SOURCE_MARKER')

    const open = render(
      createElement(ProspectResult, props({ rawInput: 'UNIQUE_SOURCE_MARKER', showSource: true })),
    )
    expect(open).toContain('UNIQUE_SOURCE_MARKER')
  })
})

// ── V3_PROSPECT_FACT_VS_INFERENCE ────────────────────────────────────────────

describe('V3_PROSPECT_FACT_VS_INFERENCE', () => {
  it('labels extracted facts separately from Relay interpretation', () => {
    const html = render(createElement(ProspectResult, props()))
    expect(html).toContain('Extracted fact')
    expect(html).toContain('Relay interpretation')
  })
})

// ── V3_PROSPECT_PROFILE_ATTRIBUTION ──────────────────────────────────────────

describe('V3_PROSPECT_PROFILE_ATTRIBUTION', () => {
  it('attributes the result to the sending profile', () => {
    const html = render(createElement(ProspectResult, props({ profileName: 'Muhammad Aneeb' })))
    expect(html).toContain('Analyzed for:')
    expect(html).toContain('Muhammad Aneeb')
  })
})

// ── V3_PROSPECT_DECISION ─────────────────────────────────────────────────────

describe('V3_PROSPECT_DECISION', () => {
  it('shows the decision word, score and the three dimensions separately', () => {
    const html = render(createElement(ProspectResult, props()))
    expect(html).toContain('Opportunity decision')
    expect(html).toContain('OBSERVE')
    expect(html).toContain('Fit')
    expect(html).toContain('Intent')
    expect(html).toContain('Decision confidence')
  })

  it('does not merge fit and intent into a single probability', () => {
    const html = render(createElement(ProspectResult, props()))
    // Fit and intent stay separate labelled values.
    expect(html).toContain('MEDIUM')
    expect(html).toContain('UNKNOWN')
  })
})

// ── V3_PROSPECT_CREATE_LEAD / CLEAR / DUPLICATE PREVENTION ───────────────────

describe('V3_PROSPECT_CREATE_LEAD', () => {
  it('uses Create Lead as the primary action for a qualified prospect', () => {
    const html = render(
      createElement(
        ProspectResult,
        props({
          result: result({
            revenue: { ...result().revenue!, act: 'CONTACT_NOW', messageRecommended: true },
            decision: {
              ...result().decision,
              recommendedAction: {
                ...result().decision.recommendedAction!,
                action: 'CONTACT_NOW',
                messageEligible: true,
              },
            },
          }),
        }),
      ),
    )
    expect(html).toContain('Create Lead')
  })
})

describe('V3_PROSPECT_CREATE_LEAD_CLEAR', () => {
  it('replaces the result with a confirmation and drops the Create Lead action', () => {
    const html = render(
      createElement(ProspectCreated, { leadId: 'lead-1', company: 'CopilotKit', onOpen: () => {}, onReset: () => {} }),
    )
    expect(html).toContain('Lead created')
    expect(html).toContain('Open Lead')
    expect(html).not.toContain('Create Lead')
  })
})

describe('V3_PROSPECT_DUPLICATE_PREVENTION', () => {
  it('clears the draft only after the server confirms the save', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/components/prospect/prospect-analyze.tsx', import.meta.url), 'utf8'),
    )
    const saveBlock = src.slice(src.indexOf('async function saveAsLead'))
    const confirmIndex = saveBlock.indexOf('if (!res.ok) throw new Error')
    const clearIndex = saveBlock.indexOf('localStorage.removeItem(DRAFT_KEY)')
    expect(confirmIndex).toBeGreaterThan(-1)
    expect(clearIndex).toBeGreaterThan(confirmIndex)
  })
})

// ── V3_PROSPECT_WATCHLIST ────────────────────────────────────────────────────

describe('V3_PROSPECT_WATCHLIST', () => {
  it('uses Save to Watchlist as the primary action for an observe prospect', () => {
    const html = render(createElement(ProspectResult, props()))
    expect(html).toContain('Save to Watchlist')
  })
})

// ── V3_PROSPECT_NORMALIZATION_REGRESSIONS ────────────────────────────────────

describe('V3_PROSPECT_NORMALIZATION_REGRESSIONS', () => {
  it('renders extracted values verbatim, never normalized or truncated', () => {
    const html = render(
      createElement(
        ProspectResult,
        props({
          result: result({
            extracted: extracted({
              name: 'Michael van der Meer',
              title: 'Senior React Engineer',
              company: "O'Reilly-Media",
              locationRaw: 'São Paulo',
            }),
          }),
        }),
      ),
    )
    expect(html).toContain('Michael van der Meer')
    expect(html).toContain('Senior React Engineer')
    // The apostrophe survives extraction and is escaped for HTML, not stripped.
    expect(html).toContain('O&#x27;Reilly-Media')
    expect(html).not.toContain('OReilly-Media')
    expect(html).toContain('São Paulo')
  })

  it('does not invent a company or opportunity that is not in the extraction', () => {
    const html = render(
      createElement(ProspectResult, props({ result: result({ extracted: extracted({ company: 'Unknown company' }) }) })),
    )
    expect(html).toContain('Unknown company')
  })
})

// ── V3_PROSPECT_MOBILE ───────────────────────────────────────────────────────

describe('V3_PROSPECT_MOBILE', () => {
  it('stacks extraction before decision and never uses a two-column layout at 375', () => {
    const html = render(createElement(ProspectResult, props()))
    const extraction = html.indexOf('Extracted profile')
    const decision = html.indexOf('Opportunity decision')
    expect(extraction).toBeGreaterThan(-1)
    expect(decision).toBeGreaterThan(extraction)
    // Single column at the base breakpoint; the extraction/decision split is lg-only.
    expect(html).toContain('grid grid-cols-1 gap-5 lg:grid-cols-')
  })
})

// ── LOADING ──────────────────────────────────────────────────────────────────

describe('V3_PROSPECT_ANALYSIS_LOADING', () => {
  it('renders real milestones with completed and pending states, never a bare Loading', () => {
    const html = render(createElement(ProspectLoadingSteps, { steps: ['Reading source', 'Extracting identity'], current: 1 }))
    expect(html).toContain('Reading source')
    expect(html).toContain('Extracting identity')
    expect(html).not.toContain('Loading...')
  })
})

// ── DISPLAY CONTRACTS ────────────────────────────────────────────────────────

describe('PROSPECT_STATUS', () => {
  const cases: Array<[string, string | null, ProspectStatus, string]> = [
    ['captured', null, 'not_actioned', 'Not actioned'],
    ['discarded', null, 'dismissed', 'Dismissed'],
    ['converted', 'lead-1', 'lead', 'Lead'],
  ]

  it.each(cases)('maps %s to %s', (status, _leadId, expected, label) => {
    expect(prospectStatus({ status: status as 'captured', convertedLeadId: null }, null)).toBe(expected)
    expect(PROSPECT_STATUS_LABELS[expected]).toBe(label)
  })

  it('maps a converted observe lead to Watchlist', () => {
    expect(prospectStatus({ status: 'converted', convertedLeadId: 'l1' }, 'observe')).toBe('watchlist')
    expect(PROSPECT_STATUS_LABELS.watchlist).toBe('Watchlist')
  })
})

describe('DECISION_WORD', () => {
  it('maps the recommended action to a decision word', () => {
    expect(decisionWordFor('CONTACT_NOW', 'strong')).toBe('CONTACT')
    expect(decisionWordFor('OBSERVE', 'maybe')).toBe('OBSERVE')
    expect(decisionWordFor('RESEARCH_MORE', 'maybe')).toBe('RESEARCH')
    expect(decisionWordFor('SKIP', 'skip')).toBe('SKIP')
  })

  it('falls back to the qualification when no action is present', () => {
    expect(decisionWordFor(null, 'strong')).toBe('CONTACT')
    expect(decisionWordFor(null, 'worth_pursuing')).toBe('CONTACT')
    expect(decisionWordFor(null, 'maybe')).toBe('RESEARCH')
    expect(decisionWordFor(null, 'skip')).toBe('SKIP')
  })
})

describe('PRIMARY_ACTION', () => {
  it('picks exactly one primary action per decision', () => {
    expect(primaryActionFor('CONTACT').label).toBe('Create Lead')
    expect(primaryActionFor('OBSERVE').label).toBe('Save to Watchlist')
    expect(primaryActionFor('RESEARCH').label).toBe('Save to Watchlist')
    expect(primaryActionFor('SKIP').label).toBe('Dismiss')
  })
})

describe('EXTRACTION_CONFIDENCE', () => {
  it('labels extraction completeness without a meter per field', () => {
    expect(confidenceLabel(90)).toBe('High')
    expect(confidenceLabel(60)).toBe('Medium')
    expect(confidenceLabel(30)).toBe('Low')
    expect(confidenceLabel(null)).toBeNull()
  })
})

describe('SOURCE_AND_RELATIONSHIP', () => {
  it('labels the source type', () => {
    expect(sourceLabelFor('linkedin_profile')).toBe('LinkedIn')
    expect(sourceLabelFor('job_posting')).toBe('Job post')
    expect(sourceLabelFor('pasted_text')).toBe('Pasted text')
    expect(sourceLabelFor(null)).toBeNull()
  })

  it('labels the commercial relationship', () => {
    expect(relationshipLabel('POTENTIAL_BUYER')).toBe('Potential buyer')
    expect(relationshipLabel('RECRUITER')).toBe('Recruiter')
    expect(relationshipLabel('UNKNOWN')).toBeNull()
  })
})

describe('DECISION_LABEL_FOR_SCORE', () => {
  it('derives the recent-row decision from the canonical score band', () => {
    expect(decisionLabelForScore(80)).toBe('Strong')
    expect(decisionLabelForScore(50)).toBe('Maybe')
    expect(decisionLabelForScore(5)).toBe('Skip')
    expect(decisionLabelForScore(null)).toBeNull()
  })
})
