/**
 * DEMO-ONLY lead extraction utility.
 *
 * This file provides a deterministic, no-AI extraction path used by:
 * - Tests (bd-pipeline.test.ts) that need to run without API keys
 * - Demo mode when no AI provider is configured
 *
 * PRODUCTION extraction uses src/lib/intelligence-v2/extraction-pipeline.ts
 * which routes through Runtime V3 (OpenCode → Groq → OpenAI).
 *
 * DO NOT add AI calls here. DO NOT import this in production routes.
 */

import type { ExtractedLead, SignalId } from '@/lib/domain/types'
import { mapLocationToRegion } from '@/lib/leads/targeting'

export interface ExtractLeadOptions {
  onStatus?: (msg: string) => void
}

export async function extractLead(rawText: string, _opts: ExtractLeadOptions = {}): Promise<ExtractedLead> {
  const nameMatch = rawText.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/)
  const titleMatch = rawText.match(/\b(?:Founder|CEO|CTO|COO|VP|Head|Director|Lead|Owner|President|Manager)\b[^.\n]{0,80}/i)
  const companyMatch = rawText.match(/\b(?:at|for|of|with)\s+([A-Z][A-Za-z0-9&._ -]{2,50})/)
  const locationMatch = rawText.match(/\b([A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+)\b/)
  const lower = rawText.toLowerCase()

  const signalType = pickDefaultSignal(lower)
  const evidence = rawText.slice(0, 160).trim()

  return {
    name: nameMatch?.[0] ?? null,
    title: titleMatch?.[0]?.trim() ?? null,
    titleRaw: titleMatch?.[0]?.trim() ?? null,
    company: companyMatch?.[1]?.trim() ?? 'Unknown company',
    url: null,
    locationRaw: locationMatch?.[1] ?? null,
    aboutSummary: rawText.slice(0, 140),
    experienceSummary: 'Career details were pasted; review profile for specifics.',
    recentPosts: [],
    roleCategory: 'other',
    marketRegion: mapLocationToRegion(locationMatch?.[1] ?? null),
    signalType,
    signalEvidence: evidence,
    extractionConfidence: 55,
    confidenceNotes: ['Demo mode: configure GROQ_API_KEY for full extraction quality.'],
    verbatimQuote: null,
    tags: [],
  }
}

function pickDefaultSignal(lower: string): SignalId {
  const signals: Array<{ id: SignalId; words: string[] }> = [
    { id: 7, words: ['looking for', 'open to', 'help us', 'need a team', 'agency', 'freelancer'] },
    { id: 1, words: ['hiring', 'job', 'open role', 'position', 'careers'] },
    { id: 2, words: ['solo', 'one developer', 'small team', 'just me', 'side project'] },
    { id: 6, words: ['slow', 'delayed', 'late', 'behind', 'overdue', 'complaint'] },
    { id: 4, words: ['no update', 'last update', 'outdated', 'abandoned', 'stale'] },
    { id: 3, words: ['funding', 'raised', 'seed round', 'series', 'investment'] },
    { id: 5, words: ['php 5', 'jquery', 'wordpress', 'legacy', 'unsupported', 'flash'] },
  ]
  for (const s of signals) {
    if (s.words.some((w) => lower.includes(w))) return s.id
  }
  return 7
}
