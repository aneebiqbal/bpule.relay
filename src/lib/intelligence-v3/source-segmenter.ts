/**
 * Deterministic LinkedIn source segmenter.
 *
 * Splits raw LinkedIn text into structured segments WITHOUT semantic
 * interpretation. Each segment retains its nearby relative timestamp.
 */

export interface SourceSegment {
  type: 'header' | 'about' | 'post' | 'experience' | 'education' | 'other'
  text: string
  relativeAge: string | null
  ageDays: number | null
  index: number
}

export function segmentLinkedInSource(rawText: string): SourceSegment[] {
  const segments: SourceSegment[] = []
  const lines = rawText.split('\n')

  let currentSection: SourceSegment['type'] = 'header'
  let currentPostLines: string[] = []
  let currentPostAge: string | null = null
  let postIndex = 0

  const flushPost = () => {
    if (currentPostLines.length > 0) {
      const text = currentPostLines.join('\n').trim()
      if (text.length > 10) {
        segments.push({
          type: 'post',
          text,
          relativeAge: currentPostAge,
          ageDays: parseRelativeAge(currentPostAge),
          index: postIndex++,
        })
      }
      currentPostLines = []
      currentPostAge = null
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) {
      // Blank line might separate posts
      if (currentPostLines.length > 0 && currentPostAge !== null) {
        flushPost()
      }
      continue
    }

    // Detect section headers (including variations like "Posts (3mo)")
    const sectionMatch = line.match(/^(About|Experience|Education|Activity|Posts|Highlights|Licenses)/i)
    if (sectionMatch) {
      flushPost()
      const sectionName = sectionMatch[1].toLowerCase()
      if (sectionName === 'activity' || sectionName === 'posts' || sectionName === 'highlights') {
        currentSection = 'other'
      } else {
        currentSection = sectionName as SourceSegment['type']
      }
      continue
    }

    // Detect relative timestamps (standalone lines like "5d •", "3mo •", "1mo •")
    const ageMatch = detectRelativeAgeLine(line)
    if (ageMatch) {
      if (currentPostLines.length > 0) {
        flushPost()
      }
      currentPostAge = ageMatch
      continue
    }

    // Detect hiring/commercial keywords that indicate post content
    const hasCommercialSignal = /hiring|looking for|seeking|join our|we.?re hiring|open role|available for hire|need a |want to hire|opportunity/i.test(line)

    if (hasCommercialSignal && currentSection !== 'about' && currentSection !== 'experience' && currentSection !== 'education') {
      if (currentPostLines.length > 0 && currentPostAge !== null) {
        flushPost()
      }
      currentSection = 'post'
    }

    // Accumulate content based on current section
    if (currentSection === 'header' || currentSection === 'about' || currentSection === 'experience' || currentSection === 'education') {
      segments.push({
        type: currentSection,
        text: line,
        relativeAge: null,
        ageDays: null,
        index: i,
      })

      // Auto-transition: after several header lines, look for posts
      if (currentSection === 'header' && i > 3) {
        currentSection = 'other' // Default to other until a section header is found
      }
    } else {
      currentPostLines.push(line)
    }
  }

  flushPost()
  return segments
}

/**
 * Detect standalone relative age lines (e.g., "5d •", "3mo •", "1mo • Edited")
 */
function detectRelativeAgeLine(line: string): string | null {
  const match = line.match(/^(\d+\s*(?:mo|w|d|y))\s*(?:[·•]|Edited|·\s*Edited)?$/i)
  return match ? match[1].trim() : null
}

function parseRelativeAge(relativeAge: string | null): number | null {
  if (!relativeAge) return null
  const match = relativeAge.match(/(\d+)\s*(mo|w|d|y)/i)
  if (!match) return null
  const value = parseInt(match[1])
  const unit = match[2].toLowerCase()
  switch (unit) {
    case 'mo': return value * 30
    case 'w': return value * 7
    case 'd': return value
    case 'y': return value * 365
    default: return null
  }
}
