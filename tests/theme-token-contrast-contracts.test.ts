/**
 * Theme token contracts.
 *
 * Every readable surface must pass WCAG AA in BOTH themes. The failure this
 * guards against: a token that is "overridden" in `.dark` with its light value
 * (as `--cobalt-faint: #eef2ff` was), which rendered the conversation's own
 * message bubble as near-white text on a near-white card.
 *
 * These contracts are structural — they read the stylesheet and the components
 * rather than rendering, so they run in the normal unit suite.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const CSS = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')

function tokenBlock(startMarker: string, endMarker: string): Record<string, string> {
  const lines = CSS.split('\n')
  const start = lines.findIndex((l) => l.trim().startsWith(startMarker))
  const end = lines.findIndex((l, i) => i > start && l.trim().startsWith(endMarker))
  const out: Record<string, string> = {}
  for (const line of lines.slice(start, end)) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?);/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const LIGHT = tokenBlock(':root {', '.dark {')
const DARK = tokenBlock('.dark {', '.public-canvas {')
const PUBLIC = tokenBlock('.public-canvas {', '@layer base')

function resolve(value: string | undefined, theme: Record<string, string>, depth = 0): [number, number, number] | null {
  if (!value || depth > 6) return null
  const v = value.trim()
  if (v.startsWith('#')) {
    const hex = v.slice(1)
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
    if (full.length !== 6) return null
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
  }
  const ref = v.match(/^var\((--[\w-]+)\)$/)
  if (ref) return resolve(theme[ref[1]], theme, depth + 1)
  return null
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (x: number) => {
    const s = x / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** Resolve a Tailwind token class (`bg-ink`, `text-on-solid`) to a colour. */
function classColor(cls: string, theme: Record<string, string>) {
  const name = cls.split('/')[0].replace(/^(bg|text|border|ring)-/, '--')
  return resolve(theme[name], theme)
}

describe('DARK_THEME_TOKENS_FLIP', () => {
  it('cobalt-faint is a dark surface in dark mode, not the light lavender', () => {
    // The exact regression: `.dark` re-declared the light value.
    expect(DARK['--cobalt-faint']).not.toBe(LIGHT['--cobalt-faint'])
    expect(DARK['--cobalt-faint']).toBe('#1a2238')
  })

  it('cobalt-dark is a text colour in dark mode, not a dark blue', () => {
    // Used as `text-cobalt-dark` on cobalt tints.
    expect(DARK['--cobalt-dark']).not.toBe(LIGHT['--cobalt-dark'])
    expect(contrast(
      resolve(DARK['--cobalt-dark'], DARK)!,
      resolve(DARK['--bone'], DARK)!,
    )).toBeGreaterThan(4.5)
  })

  it('every status fill has an "on" text token that flips with it', () => {
    // A light-mode dark green becomes a dark-mode light green, so light text
    // stops working unless the "on" token flips too.
    for (const fill of ['--on-success', '--on-danger']) {
      expect(LIGHT[fill], `${fill} missing from :root`).toBeTruthy()
      expect(DARK[fill], `${fill} missing from .dark`).toBeTruthy()
      expect(LIGHT[fill]).not.toBe(DARK[fill])
    }
  })

  it('no light token is left undefined in dark mode', () => {
    // `--line-organic` was missing entirely, so it stayed light beige.
    expect(DARK['--line-organic']).toBeTruthy()
  })

  it('.public-canvas declares every token that dark mode changes', () => {
    // `.public-canvas` is a descendant of `<html>`, so any token it leaves
    // undeclared inherits the `.dark` value — light text on a forced-light
    // canvas when the OS is in dark mode.
    const leaked = Object.entries(DARK)
      .filter(([name, value]) => LIGHT[name] !== value)
      .map(([name]) => name)
      .filter((name) => !PUBLIC[name])
    expect(leaked, `public canvas leaks dark tokens:\n${leaked.join('\n')}`).toEqual([])
  })
})

describe('TOKEN_PAIR_CONTRAST_BOTH_THEMES', () => {
  const PAIRS: Array<{ label: string; bg: string; fg: string }> = [
    { label: 'conversation bubble (mine)', bg: 'bg-cobalt-faint', fg: 'text-ink' },
    { label: 'conversation bubble (inbound)', bg: 'bg-bone', fg: 'text-ink' },
    { label: 'orange CTA', bg: 'bg-orange', fg: 'text-on-orange' },
    { label: 'cobalt button', bg: 'bg-cobalt', fg: 'text-on-accent' },
    { label: 'solid button', bg: 'bg-solid', fg: 'text-on-solid' },
    { label: 'ink button', bg: 'bg-ink', fg: 'text-bone' },
    { label: 'success button', bg: 'bg-status-success', fg: 'text-on-success' },
    { label: 'danger button', bg: 'bg-status-danger', fg: 'text-on-danger' },
    { label: 'orange faint chip', bg: 'bg-orange-faint', fg: 'text-orange-ink' },
  ]

  for (const { label, bg, fg } of PAIRS) {
    it(`${label} passes AA in light, dark and public themes`, () => {
      for (const [name, theme] of [['light', LIGHT], ['dark', DARK], ['public', PUBLIC]] as const) {
        const bgc = classColor(bg, theme)
        const fgc = classColor(fg, theme)
        expect(bgc, `${bg} unresolved in ${name}`).not.toBeNull()
        expect(fgc, `${fg} unresolved in ${name}`).not.toBeNull()
        const ratio = contrast(bgc!, fgc!)
        expect(ratio, `${label}: ${ratio.toFixed(2)}:1 in ${name}`).toBeGreaterThan(4.5)
      }
    })
  }
})

describe('NO_HARDCODED_THEME_COLOURS', () => {
  const EXEMPT = /(^landing\/|\/og\/|relay-logo\.tsx)/

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) out.push(...walk(full))
      else if (full.endsWith('.tsx')) out.push(full)
    }
    return out
  }

  it('components use tokens, not literal hex, for text and fills', () => {
    const offenders: string[] = []
    for (const base of ['src/components', 'src/app']) {
      for (const file of walk(join(ROOT, base))) {
        if (EXEMPT.test(relative(ROOT, file))) continue
        const src = readFileSync(file, 'utf8')
        for (const m of src.matchAll(/(?:text|bg|border|ring)-\[#[0-9a-fA-F]{3,8}\]/g)) {
          offenders.push(`${relative(ROOT, file)}: ${m[0]}`)
        }
      }
    }
    expect(offenders, `hardcoded theme colours:\n${offenders.join('\n')}`).toEqual([])
  })

  it('no raw Tailwind palette colours (they do not follow the theme)', () => {
    // bg-blue-50 / text-red-500 etc. are fixed hues: they pass in light mode
    // and fail the moment the canvas flips.
    const RAW = /(?:bg|text|border|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}/
    const offenders: string[] = []
    for (const base of ['src/components', 'src/app']) {
      for (const file of walk(join(ROOT, base))) {
        if (EXEMPT.test(relative(ROOT, file))) continue
        const src = readFileSync(file, 'utf8')
        for (const m of src.matchAll(new RegExp(RAW, 'g'))) {
          offenders.push(`${relative(ROOT, file)}: ${m[0]}`)
        }
      }
    }
    expect(offenders, `raw palette colours:\n${offenders.join('\n')}`).toEqual([])
  })

  it('white text is never placed on a light-filled background', () => {
    // `text-white` on `bg-orange` / `bg-status-success` fails once the fill
    // flips; the "on" tokens are the only safe choice.
    const offenders: string[] = []
    for (const base of ['src/components', 'src/app']) {
      for (const file of walk(join(ROOT, base))) {
        if (EXEMPT.test(relative(ROOT, file))) continue
        const src = readFileSync(file, 'utf8')
        if (/text-white|bg-white/.test(src)) offenders.push(relative(ROOT, file))
      }
    }
    expect(offenders, `literal white usage:\n${offenders.join('\n')}`).toEqual([])
  })
})
