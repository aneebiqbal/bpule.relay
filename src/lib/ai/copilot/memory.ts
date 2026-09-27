/**
 * Conversation Copilot - Compact Memory Builder
 *
 * Does NOT resend full history. Builds a compact canonical memory from
 * deterministic conversation state plus recent messages.
 */

import type { Message } from '@/lib/domain/types'
import type { ConversationKnowledge } from '@/lib/relay/revenue-strategy'


export interface ConversationMemory {
  relationship: string
  current_stage: string
  latest_objective: string
  important_facts: string[]
  questions_answered: string[]
  claims_made: string[]
  commercial_constraints: string[]
  approved_proof: string[]
  latest_messages: Array<{ role: 'you' | 'them'; text: string }>
}

export function buildConversationMemory(params: {
  stage: string
  knowledge: ConversationKnowledge | null
  priorMessages: Message[]
  recentWindow?: number
}): ConversationMemory {
  const { stage, knowledge, priorMessages, recentWindow = 6 } = params

  const importantFacts: string[] = []
  const constraints: string[] = []
  const claims: string[] = []
  const answered: string[] = []
  const proof: string[] = []

  if (knowledge) {
    for (const [field, entry] of Object.entries(knowledge.fields)) {
      if (entry.value == null) continue
      const v = entry.value as string
      if (field === 'timeline') constraints.push(v)
      else if (field === 'need') importantFacts.push(v)
      else if (field === 'proofNeeded') proof.push(v)
      else importantFacts.push(v)
    }
    if (knowledge.newFacts?.length) {
      for (const f of knowledge.newFacts) {
        if (/already hired|not interested|filled/i.test(f)) constraints.push(f)
        else if (/interested|next step|let's/i.test(f)) importantFacts.push(f)
        else importantFacts.push(f)
      }
    }
  }

  // Recent messages - last N only
  const recent = priorMessages
    .filter((m) => m.sentText)
    .sort((a, b) => (a.sentAt ?? a.createdAt).localeCompare(b.sentAt ?? b.createdAt))
    .slice(-recentWindow)

  const latestMessages: Array<{ role: 'you' | 'them'; text: string }> = recent.map((m) => ({
    role: m.direction === 'inbound' ? 'them' : 'you',
    text: m.sentText?.slice(0, 300) ?? '',
  }))

  return {
    relationship: 'commercial prospect conversation',
    current_stage: stage,
    latest_objective: knowledge?.messageJob ?? 'discover need',
    important_facts: dedupe(importantFacts),
    questions_answered: dedupe(answered),
    claims_made: dedupe(claims),
    commercial_constraints: dedupe(constraints),
    approved_proof: dedupe(proof),
    latest_messages: latestMessages,
  }
}

export function serializeMemoryForPrompt(memory: ConversationMemory): string {
  const lines: string[] = []
  lines.push(`STAGE: ${memory.current_stage}`)
  lines.push(`OBJECTIVE: ${memory.latest_objective}`)
  if (memory.commercial_constraints.length) {
    lines.push(`CONSTRAINTS:\n${memory.commercial_constraints.map((c) => `  - ${c}`).join('\n')}`)
  }
  if (memory.important_facts.length) {
    lines.push(`KNOWN FACTS:\n${memory.important_facts.map((f) => `  - ${f}`).join('\n')}`)
  }
  if (memory.approved_proof.length) {
    lines.push(`APPROVED PROOF:\n${memory.approved_proof.map((p) => `  - ${p}`).join('\n')}`)
  }
  if (memory.latest_messages.length) {
    lines.push(`RECENT MESSAGES:`)
    for (const m of memory.latest_messages.slice(-4)) {
      lines.push(`  [${m.role}] ${m.text.slice(0, 200)}`)
    }
  }
  return lines.join('\n')
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))]
}
