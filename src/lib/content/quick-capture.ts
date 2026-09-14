import type { QuickCaptureAngle } from '@/lib/domain/types'

/**
 * Quick Capture — messy input → structured angles.
 *
 * Deterministic parsing. No model calls.
 * Understands messy user input and suggests content angles.
 */

export function parseQuickCapture(rawInput: string): QuickCaptureAngle[] {
  const angles: QuickCaptureAngle[] = []
  const lower = rawInput.toLowerCase()

  // ── Technical work ──────────────────────────────────────────────────
  if (/\b(spent|debugged|fixed|built|shipped|deployed|refactored|migrated|optimized|solved|resolved)\b/.test(lower)) {
    const subject = extractSubject(rawInput, ['spent', 'debugged', 'fixed', 'built', 'shipped', 'deployed', 'refactored', 'migrated', 'optimized', 'solved', 'resolved'])
    angles.push({
      angle: `Turn this into a technical lesson. What made this hard? What would you tell someone facing the same problem?`,
      type: 'technical_lesson',
      title: subject ? `The ${subject} problem that took hours` : 'The problem that took hours to solve',
    })
    angles.push({
      angle: `Share the before/after. What changed? Why does it matter?`,
      type: 'observation',
      title: subject ? `What ${subject} taught me` : 'What this work taught me',
    })
  }

  // ── Learning / lesson ───────────────────────────────────────────────
  if (/\b(learned|lesson|mistake|failed|wrong|realized|discovered|found out|turns out)\b/.test(lower)) {
    angles.push({
      angle: `Share this as a lesson. What happened? What would you do differently?`,
      type: 'technical_lesson',
      title: 'The lesson I learned the hard way',
    })
    angles.push({
      angle: `Frame it as advice. What should others avoid?`,
      type: 'how_to',
      title: 'What I wish I knew before this',
    })
  }

  // ── Opinion / belief ────────────────────────────────────────────────
  if (/\b(i think|i believe|in my opinion|hot take|unpopular|honestly|actually|the truth is|people don't)\b/.test(lower)) {
    angles.push({
      angle: `Share this opinion. What experiences back it up?`,
      type: 'opinion',
      title: 'My honest take on this',
    })
    angles.push({
      angle: `Frame it as a contrarian position. What do most people get wrong?`,
      type: 'opinion',
      title: 'The unpopular opinion I hold',
    })
  }

  // ── Client / work situation ─────────────────────────────────────────
  if (/\b(client|customer|user|stakeholder|manager|team|meeting|requirement|deadline|project)\b/.test(lower)) {
    angles.push({
      angle: `Extract the professional lesson. What does this teach about working with people?`,
      type: 'story',
      title: 'The client situation that taught me something',
    })
    angles.push({
      angle: `Share the behind-the-scenes. What really happened?`,
      type: 'observation',
      title: 'What really happens in these situations',
    })
  }

  // ── Career / milestone ──────────────────────────────────────────────
  if (/\b(promoted|hired|joined|left|fired|started|quit|launched|graduated|certification)\b/.test(lower)) {
    angles.push({
      angle: `Share the journey. What led here? What's next?`,
      type: 'story',
      title: 'A career moment worth sharing',
    })
  }

  // ── Numbers / metrics ───────────────────────────────────────────────
  if (/\b(\d+%|\d+x|\$\d+|\d+ hours|\d+ days|\d+ weeks|\d+ months|\d+ users|\d+ customers)\b/.test(lower)) {
    angles.push({
      angle: `Lead with the numbers. What do they mean? Why should people care?`,
      type: 'observation',
      title: 'The numbers that tell the story',
    })
  }

  // ── Fallback ────────────────────────────────────────────────────────
  if (angles.length === 0) {
    angles.push(
      {
        angle: `What's the lesson here? Share it as advice.`,
        type: 'how_to',
        title: 'What this experience taught me',
      },
      {
        angle: `What would you tell someone in the same situation?`,
        type: 'story',
        title: 'A moment worth sharing',
      },
    )
  }

  return angles.slice(0, 3)
}

function extractSubject(input: string, triggerWords: string[]): string | null {
  for (const trigger of triggerWords) {
    const idx = input.toLowerCase().indexOf(trigger)
    if (idx >= 0) {
      const after = input.slice(idx + trigger.length).trim()
      const words = after.split(/\s+/).slice(0, 5).join(' ')
      if (words.length > 3) return words.replace(/[.!?]+$/, '')
    }
  }
  return null
}
