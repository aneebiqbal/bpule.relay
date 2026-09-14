/**
 * Visual Concept Generator — creates image prompts for social posts.
 *
 * Every generated social post gets an optional visual concept: a concise
 * prompt the user can copy into any image-generation model. The concept
 * is generated AFTER the final post is selected so it reflects the actual angle.
 */

export interface VisualConcept {
  visualIdea: string
  imagePrompt: string
}

export interface VisualConceptInput {
  postText: string
  platform: 'linkedin' | 'x'
  angle: string
  topic: string
  styleCard?: string | null
  /** The specific insight or detail the post centers on */
  coreDetail: string
  /** The emotional tone of the post */
  tone: string
  /** Whether to prefer illustration, photography, or abstract */
  visualStyle?: 'editorial-illustration' | 'technical-diagram' | 'visual-metaphor' | 'object-composition' | 'minimal-data' | 'photographic' | 'typographic' | 'abstract-concept'
}

const OVERUSED_VISUALS = [
  /generic\s+laptop/i,
  /robot\b/i,
  /ai\s+brain/i,
  /floating\s+code/i,
  /futuristic\s+dashboard/i,
  /stock\s+photo/i,
  /developer\s+at\s+desk/i,
  /motivational\s+quote\s+card/i,
  /person\s+looking\s+at\s+screen/i,
  /digital\s+brain/i,
  /circuit\s+board/i,
  /abstract\s+blue\s+technology/i,
  /shaking\s+hands/i,
  /business\s+meeting/i,
  /laptop\s+on\s+a\s+table/i,
]

/**
 * Generate a visual concept for a social post.
 * Returns a structured concept with idea description and image prompt.
 */
export function generateVisualConcept(input: VisualConceptInput): VisualConcept {
  const style = input.visualStyle ?? selectVisualStyle(input)
  const concept = buildConcept(input, style ?? 'editorial-illustration')
  return concept
}

function selectVisualStyle(input: VisualConceptInput): VisualConceptInput['visualStyle'] {
  const lower = (input.angle + ' ' + input.coreDetail + ' ' + input.topic).toLowerCase()

  if (lower.includes('data') || lower.includes('metric') || lower.includes('number') || lower.includes('percent')) {
    return 'minimal-data'
  }
  if (lower.includes('debug') || lower.includes('deploy') || lower.includes('config') || lower.includes('system')) {
    return 'technical-diagram'
  }
  if (lower.includes('mistake') || lower.includes('lesson') || lower.includes('realization') || lower.includes('discover')) {
    return 'visual-metaphor'
  }
  if (lower.includes('compare') || lower.includes('versus') || lower.includes('before') || lower.includes('after')) {
    return 'object-composition'
  }
  if (lower.includes('opinion') || lower.includes('believe') || lower.includes('think') || lower.includes('argue')) {
    return 'typographic'
  }
  if (lower.includes('abstract') || lower.includes('concept') || lower.includes('idea')) {
    return 'abstract-concept'
  }

  return 'editorial-illustration'
}

function buildConcept(input: VisualConceptInput, style: NonNullable<VisualConceptInput['visualStyle']>): VisualConcept {
  const aspectRatio = input.platform === 'linkedin' ? 'LinkedIn landscape composition (1.91:1)' : 'X composition (16:9)'

  const baseConstraints = 'No people. No generic AI imagery. No stock photos. No robots. No floating code. No motivational quote cards. No laptops on tables.'

  switch (style) {
    case 'editorial-illustration':
      return {
        visualIdea: `Editorial illustration capturing the core idea: ${input.coreDetail.slice(0, 80)}`,
        imagePrompt: `Minimal editorial tech illustration: ${summarizeForImage(input.coreDetail)}. ${input.tone === 'serious' ? 'Muted, serious palette' : 'Restrained, focused palette'}. Clean lines, precise technical-diagram sensibility. Dark graphite background, warm off-white elements, one restrained accent color. ${baseConstraints} Premium software editorial style. ${aspectRatio}.`,
      }

    case 'technical-diagram':
      return {
        visualIdea: `Technical diagram showing: ${input.coreDetail.slice(0, 80)}`,
        imagePrompt: `Clean technical diagram: ${summarizeForImage(input.coreDetail)}. Precise lines, clear relationships, functional aesthetic. Muted technical palette with one signal color for the key insight. White or near-white background. Annotated sparingly. Engineering documentation quality, not decorative. ${baseConstraints} Technical reference aesthetic. ${aspectRatio}.`,
      }

    case 'visual-metaphor':
      return {
        visualIdea: `Visual metaphor for: ${input.coreDetail.slice(0, 80)}`,
        imagePrompt: `Conceptual visual metaphor: ${summarizeForImage(input.coreDetail)}. Single clear metaphor, not literal illustration. Restrained color palette, one focal element. Negative space used deliberately. Thoughtful composition that rewards a second look. Editorial quality, not commercial stock. ${baseConstraints} Conceptual art direction. ${aspectRatio}.`,
      }

    case 'object-composition':
      return {
        visualIdea: `Object composition representing: ${input.coreDetail.slice(0, 80)}`,
        imagePrompt: `Carefully composed still life: objects representing ${summarizeForImage(input.coreDetail)}. Intentional arrangement, clean lighting, editorial quality. Muted tones, one accent. The composition itself communicates the idea without text. ${baseConstraints} Product photography quality. ${aspectRatio}.`,
      }

    case 'minimal-data':
      return {
        visualIdea: `Minimal data visualization of: ${input.coreDetail.slice(0, 80)}`,
        imagePrompt: `Minimal data visualization: one key relationship or number from "${summarizeForImage(input.coreDetail)}". Clean typography, generous white space, single chart or comparison. Muted palette with one accent color for the key data point. Information design quality, not dashboard. ${baseConstraints} Data journalism aesthetic. ${aspectRatio}.`,
      }

    case 'photographic':
      return {
        visualIdea: `Photographic concept for: ${input.coreDetail.slice(0, 80)}`,
        imagePrompt: `Editorial photograph: ${summarizeForImage(input.coreDetail)}. Natural lighting, authentic moment, not staged. Muted color grading, documentary quality. The image should feel like it was captured, not generated. ${baseConstraints} Documentary photography aesthetic. ${aspectRatio}.`,
      }

    case 'typographic':
      return {
        visualIdea: `Typographic concept expressing: ${input.coreDetail.slice(0, 80)}`,
        imagePrompt: `Typography-driven composition: one key phrase from "${summarizeForImage(input.coreDetail)}" as the visual focal point. Thoughtful type choice, deliberate scale relationships. Minimal imagery — the type IS the image. Restrained palette, editorial layout quality. ${baseConstraints} Editorial design aesthetic. ${aspectRatio}.`,
      }

    case 'abstract-concept':
      return {
        visualIdea: `Abstract visual for: ${input.coreDetail.slice(0, 80)}`,
        imagePrompt: `Abstract conceptual composition: ${summarizeForImage(input.coreDetail)}. Shapes, color, and space communicating the idea without literal representation. Restrained palette, deliberate composition. Rewards contemplation. Fine art quality, not decorative. ${baseConstraints} Abstract editorial aesthetic. ${aspectRatio}.`,
      }
  }
}

/**
 * Summarize a detail into a concise form suitable for an image prompt.
 * Strips quotes, names, and overly specific references that won't visualize well.
 */
function summarizeForImage(text: string): string {
  // Remove quotes
  let cleaned = text.replace(/[""]/g, '')
  // Remove em dashes and their surrounding context
  cleaned = cleaned.replace(/\s*[—–]\s*/g, ' ')
  // Truncate to a reasonable length
  if (cleaned.length > 120) {
    cleaned = cleaned.slice(0, 117) + '...'
  }
  return cleaned.trim()
}

/**
 * Check if a visual concept is too generic/overused.
 * Returns true if the concept passes originality checks.
 */
export function isVisualConceptOriginal(imagePrompt: string): boolean {
  return !OVERUSED_VISUALS.some(pattern => pattern.test(imagePrompt))
}

/**
 * Build a system prompt for the visual concept generation model.
 * Used when delegating concept generation to a model call.
 */
export function buildVisualSystemPrompt(): string {
  return `You create visual concepts for social media posts. Your job is to describe an image concept that makes someone curious about the post caption.

CRITICAL RULES:
- Never suggest generic imagery: no laptops, no robots, no AI brains, no floating code, no stock photos, no motivational quote cards.
- Every concept must be SPECIFIC to the post's actual content and angle.
- The image should complement the post, not literally illustrate every sentence.
- Prefer editorial illustration, technical diagrams, visual metaphors, or abstract concepts over photography.
- If the post is about a technical debugging story, the image should NOT show a person at a computer. It should visualize the CONCEPT.

Return JSON: { "visual_idea": "one sentence describing the concept", "image_prompt": "concise production-ready prompt" }`
}

/**
 * Build a user prompt for visual concept generation.
 */
export function buildVisualUserPrompt(input: {
  postText: string
  topic: string
  angle: string
  platform: string
}): string {
  return `POST TOPIC: ${input.topic}
POST ANGLE: ${input.angle}
PLATFORM: ${input.platform}

POST TEXT:
"""
${input.postText.slice(0, 500)}
"""

Create a visual concept for this post. Output JSON: { "visual_idea": "...", "image_prompt": "..." }`
}
