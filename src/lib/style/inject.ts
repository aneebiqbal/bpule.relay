import type { StyleCard } from '@/lib/domain/types'

/**
 * The single place that turns a style card into prompt directives.
 *
 * Keep every call to this function here; feature code never hand-assembles
 * style instructions. Returns an empty string when there is no card, so the
 * calibrate step is not a hard dependency of the draft pipeline.
 */
export function injectStyleCard(card: StyleCard | null | undefined): string {
  if (!card) return ''

  const lines: string[] = []
  lines.push('Write in the voice of the sender, using this style card exactly. The person sending these messages writes like this:')

  lines.push(`Contractions: ${card.contractions.replaceAll('_', ' ')}.`)
  lines.push(
    `Formality: ${card.formality} out of 5 (5 is most formal). Sentence length: ${card.sentence_length.replaceAll('_', ' ')}. Punctuation: ${card.punctuation}.`,
  )
  lines.push(`Open cold messages with ${card.openers === 'question' ? 'a question' : 'a statement'}.`)
  if (card.emoji_use === 'light') lines.push('An emoji is acceptable occasionally. Otherwise none.')
  if (card.greeting) lines.push(`Greeting: ${card.greeting}`)
  if (card.sign_off) lines.push(`Sign off with: ${card.sign_off}`)
  if (card.never_words.length) {
    lines.push(`Never use these words or phrases: ${card.never_words.join(', ')}.`)
  }
  if (card.preferred_words.length) {
    lines.push(`Reach for these words when natural: ${card.preferred_words.join(', ')}.`)
  }
  lines.push(`Voice summary to hold in mind: ${card.summary}`)

  return lines.join('\n')
}