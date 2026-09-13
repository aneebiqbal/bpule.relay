// Unicode bold/italic via mathematical alphanumeric symbol substitution — the
// same trick every serious LinkedIn/X tool uses, since neither platform's
// native editor supports real rich text.

const BOLD_MAP: Record<string, string> = {}
const ITALIC_MAP: Record<string, string> = {}

function fill(map: Record<string, string>, upperStart: number, lowerStart: number, digitStart?: number) {
  for (let i = 0; i < 26; i++) {
    map[String.fromCharCode(65 + i)] = String.fromCodePoint(upperStart + i)
    map[String.fromCharCode(97 + i)] = String.fromCodePoint(lowerStart + i)
  }
  if (digitStart !== undefined) {
    for (let i = 0; i < 10; i++) {
      map[String.fromCharCode(48 + i)] = String.fromCodePoint(digitStart + i)
    }
  }
}

fill(BOLD_MAP, 0x1d400, 0x1d41a, 0x1d7ce)
fill(ITALIC_MAP, 0x1d434, 0x1d44e)

function applyMap(text: string, map: Record<string, string>): string {
  return [...text].map((ch) => map[ch] ?? ch).join('')
}

export function toBoldUnicode(text: string): string {
  return applyMap(text, BOLD_MAP)
}

export function toItalicUnicode(text: string): string {
  return applyMap(text, ITALIC_MAP)
}

/**
 * True once any character in the string is already one of our substituted
 * bold/italic glyphs — lets a toggle button know whether to apply or strip.
 */
export function hasUnicodeFormatting(text: string): boolean {
  const boldChars = new Set(Object.values(BOLD_MAP))
  const italicChars = new Set(Object.values(ITALIC_MAP))
  return [...text].some((ch) => boldChars.has(ch) || italicChars.has(ch))
}

const REVERSE_MAP: Record<string, string> = {}
for (const [plain, styled] of Object.entries(BOLD_MAP)) REVERSE_MAP[styled] = plain
for (const [plain, styled] of Object.entries(ITALIC_MAP)) REVERSE_MAP[styled] = plain

export function stripUnicodeFormatting(text: string): string {
  return [...text].map((ch) => REVERSE_MAP[ch] ?? ch).join('')
}
