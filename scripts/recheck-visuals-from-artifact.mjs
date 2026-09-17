#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { generateVisualConcept, isVisualConceptOriginal } from '../src/lib/writing/visual.ts'

const inputFile = process.argv[2]

if (!inputFile) {
  console.error('Usage: node scripts/recheck-visuals-from-artifact.mjs <artifact-json-path>')
  process.exit(1)
}

function visualQuality(visualIdea, imagePrompt) {
  if (!visualIdea || !imagePrompt) return 'BAD'
  if (visualIdea.length < 20) return 'LIGHT_EDIT'
  return isVisualConceptOriginal(imagePrompt) ? 'GOOD' : 'LIGHT_EDIT'
}

function promptQuality(imagePrompt) {
  if (!imagePrompt) return 'BAD'
  const hasAspect = imagePrompt.includes('1.91:1') || imagePrompt.includes('16:9')
  const lower = imagePrompt.toLowerCase()
  const hasConstraints = lower.includes('no robots') && lower.includes('no stock photos')
  const original = isVisualConceptOriginal(imagePrompt)
  if (hasAspect && hasConstraints && original) return 'GOOD'
  if (original) return 'LIGHT_EDIT'
  return 'BAD'
}

function compositionBucket(visualIdea) {
  const text = String(visualIdea || '').toLowerCase()
  if (text.includes('technical diagram')) return 'technical-diagram'
  if (text.includes('data visualization')) return 'minimal-data'
  if (text.includes('typographic')) return 'typographic'
  if (text.includes('object composition')) return 'object-composition'
  if (text.includes('visual metaphor')) return 'visual-metaphor'
  if (text.includes('editorial illustration')) return 'editorial-illustration'
  return 'other'
}

async function main() {
  const source = JSON.parse(await fs.readFile(inputFile, 'utf8'))

  const rows = source.rows.map((row) => {
    const caption = row.fullCaption || row.captionPreview || ''
    const concept = generateVisualConcept({
      postText: caption,
      platform: 'linkedin',
      angle: row.ideaTitle || '',
      topic: row.ideaTitle || '',
      coreDetail: caption.slice(0, 140),
      tone: 'confident',
    })

    return {
      persona: row.persona,
      postRating: row.postRating,
      beforeVisualIdea: row.visualIdea,
      beforeImagePrompt: row.imagePrompt,
      beforeVisualQuality: row.visualQuality,
      beforeImagePromptQuality: row.imagePromptQuality,
      afterVisualIdea: concept.visualIdea,
      afterImagePrompt: concept.imagePrompt,
      afterVisualQuality: visualQuality(concept.visualIdea, concept.imagePrompt),
      afterImagePromptQuality: promptQuality(concept.imagePrompt),
      composition: compositionBucket(concept.visualIdea),
    }
  })

  const summary = {
    total: rows.length,
    goodVisual: rows.filter((r) => r.afterVisualQuality === 'GOOD').length,
    goodPrompt: rows.filter((r) => r.afterImagePromptQuality === 'GOOD').length,
    uniqueCompositions: [...new Set(rows.map((r) => r.composition))],
  }

  const output = {
    generatedAt: new Date().toISOString(),
    baselineFile: inputFile,
    baselinePostSummary: source.summary,
    summary,
    rows,
  }

  const outFile = path.join(
    process.cwd(),
    'benchmark-results',
    `dogfood-visual-recheck-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )
  await fs.writeFile(outFile, JSON.stringify(output, null, 2), 'utf8')

  console.log(JSON.stringify({ outFile, ...output }, null, 2))
}

main().catch((error) => {
  console.error('[recheck-visuals-from-artifact] failed', error)
  process.exit(1)
})
