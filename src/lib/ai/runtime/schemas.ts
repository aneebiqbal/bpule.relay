/**
 * AI Runtime V3 — Structured Output Schemas & Validation
 *
 * Each interpretation task declares an expected output shape. The runtime
 * validates AI output against it, retries once on failure, and fails safely.
 *
 * No zod (kept out of this codebase intentionally). Lightweight shape
 * validation that catches missing fields and type mismatches.
 */


export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object'

export interface FieldSpec {
  type: FieldType
  required?: boolean
  description?: string
  items?: FieldSpec // for array type
}

export type ShapeSchema = Record<string, FieldSpec>


export const CONVERSATION_UNDERSTAND_SCHEMA: ShapeSchema = {
  intent: { type: 'string', required: true, description: 'interested|objection|question|pricing|not_interested|meeting_request|unclear' },
  sentiment: { type: 'string', required: true, description: 'positive|neutral|negative' },
  questions: { type: 'array', required: true },
  objection: { type: 'string', required: false },
  commercial_signal: { type: 'boolean', required: false },
  objective: { type: 'string', required: true, description: 'conversation objective in one sentence' },
  missing_context: { type: 'array', required: false },
  relevant_evidence_ids: { type: 'array', required: false },
  knowledge_release: { type: 'array', required: false },
  confidence: { type: 'string', required: false, description: 'high|medium|low' },
}

export const CONVERSATION_REPLY_SCHEMA: ShapeSchema = {
  recommended_reply: { type: 'string', required: true },
  goal: { type: 'string', required: true },
  tone: { type: 'string', required: false },
  cta_strategy: { type: 'string', required: false },
}


export const LEAD_INTERPRET_SCHEMA: ShapeSchema = {
  commercial_reading: { type: 'string', required: false },
  relationship_signal: { type: 'string', required: false },
  evidence_claims: {
    type: 'array',
    required: false,
    items: { type: 'object' } as FieldSpec,
  },
  confidence: { type: 'string', required: false },
}


export interface ValidationResult {
  valid: boolean
  missing: string[]
  typeErrors: string[]
}

export function validateShape(data: Record<string, unknown>, schema: ShapeSchema): ValidationResult {
  const missing: string[] = []
  const typeErrors: string[] = []

  for (const [key, spec] of Object.entries(schema)) {
    const value = data[key]

    if (value === undefined || value === null) {
      if (spec.required) missing.push(key)
      continue
    }

    const actualType = typeof value
    if (spec.type === 'array') {
      if (!Array.isArray(value)) {
        typeErrors.push(`${key}: expected array, got ${actualType}`)
      } else if (spec.items) {
        for (let i = 0; i < value.length; i++) {
          if (spec.items.type === 'object') {
            if (typeof value[i] !== 'object' || value[i] === null || Array.isArray(value[i])) {
              typeErrors.push(`${key}[${i}]: expected object`)
            }
          }
        }
      }
    } else if (actualType !== spec.type) {
      typeErrors.push(`${key}: expected ${spec.type}, got ${actualType}`)
    }
  }

  return { valid: missing.length === 0 && typeErrors.length === 0, missing, typeErrors }
}

/** Build a compact JSON instruction block to append to prompts */
export function schemaAsPromptInstruction(schema: ShapeSchema): string {
  const parts: string[] = ['Return a single JSON object with these fields:']
  for (const [key, spec] of Object.entries(schema)) {
    const req = spec.required ? '(required)' : '(optional)'
    parts.push(`  ${key}: ${spec.type} ${req}${spec.description ? ' — ' + spec.description : ''}`)
  }
  return parts.join('\n')
}
