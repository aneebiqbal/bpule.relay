/**
 * Find Jobs — salary parsing and formatting.
 *
 * Handles messy human/provider salary strings without inventing currency
 * conversions. We preserve the original currency; filtering compares only
 * within the same currency, and any ambiguous range degrades to "unknown"
 * rather than a guessed number.
 */

import type { SalaryInfo, SalaryPeriod } from './types'

const CURRENCY_SYMBOL_MAP: Array<{ symbol: string; code: string }> = [
  { symbol: '$', code: 'USD' },
  { symbol: 'US$', code: 'USD' },
  { symbol: '€', code: 'EUR' },
  { symbol: '£', code: 'GBP' },
  { symbol: '¥', code: 'JPY' },
  { symbol: '₹', code: 'INR' },
  { symbol: 'Rs', code: 'PKR' },
  { symbol: 'A$', code: 'AUD' },
  { symbol: 'CA$', code: 'CAD' },
  { symbol: 'C$', code: 'CAD' },
  { symbol: 'CHF', code: 'CHF' },
  { symbol: 'SEK', code: 'SEK' },
  { symbol: 'NOK', code: 'NOK' },
  { symbol: 'DKK', code: 'DKK' },
  { symbol: 'PLN', code: 'PLN' },
  { symbol: 'kr', code: 'SEK' },
]

const CODE_FORMAT = /^[A-Z]{3}$/
const PERIOD_MAP: Record<string, SalaryPeriod> = {
  year: 'year',
  yearly: 'year',
  annual: 'year',
  annum: 'year',
  month: 'month',
  monthly: 'month',
  week: 'week',
  weekly: 'week',
  day: 'day',
  daily: 'day',
  hour: 'hour',
  hourly: 'hour',
  '/yr': 'year',
  '/year': 'year',
  '/mo': 'month',
  '/month': 'month',
  '/hr': 'hour',
  '/hour': 'hour',
  '/wk': 'week',
}

/** Greps the first currency code/symbol out of a raw salary string. */
export function detectCurrency(raw: string): string | undefined {
  const trimmed = raw.trim()
  const upper = trimmed.toUpperCase()
  for (const code of ['USD', 'EUR', 'GBP', 'PKR', 'CAD', 'AUD', 'INR', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'AED', 'SAR']) {
    if (new RegExp(`\\b${code}\\b`).test(upper)) return code
  }
  for (const { symbol, code } of [...CURRENCY_SYMBOL_MAP].sort((a, b) => b.symbol.length - a.symbol.length)) {
    if (upper.includes(symbol.toUpperCase())) return code
  }
  return undefined
}

/** Extracts a period (annual/hourly/...) from a raw salary string. */
export function detectPeriod(raw: string): SalaryPeriod | undefined {
  const lower = ` ${raw.toLowerCase()} `
  for (const [key, period] of Object.entries(PERIOD_MAP)) {
    if (lower.includes(` ${key} `) || lower.endsWith(` ${key}`) || lower.startsWith(`${key} `)) return period
  }
  // Defaults: bare "$90k-$120k" reads as annual for salaries, hourly for small values.
  const numbers = extractNumbers(raw)
  if (numbers.length > 0 && Math.max(...numbers) < 1000 && !/[kK]/u.test(raw)) return 'hour'
  return 'year'
}

/** Extract all numeric amounts from a raw salary string (supports `k`, `K`, commas, decimals). */
export function extractNumbers(raw: string): number[] {
  const matches = raw.match(/\d[\d,.]*(k|k)?/giu) ?? []
  const out: number[] = []
  for (const m of matches) {
    const normalized = m.replace(/,/g, '')
    const mult = /k/iu.test(m) ? 1000 : 1
    const num = Number(normalized.replace(/k/iu, ''))
    if (Number.isFinite(num)) out.push(Math.round(num * mult))
  }
  return out
}

const NO_SALARY_PATTERNS = [
  /\b(salary\s+)?(not\s+)?(disclosed|not\s+shown|hidden|competitive|depends|on\s+experience|unlisted|n\/a|none)\b/i,
  /\b(unpaid|volunteer)\b/i,
]

/**
 * Parse arbitrary provider salary data into a normalized SalaryInfo.
 * Accepts a number, a string like "$90k - $120k", or an object shape a
 * provider may already hand us partially parsed.
 */
export function parseSalary(
  value: unknown,
  fallbackCurrency?: string | null,
): SalaryInfo | null {
  if (value === null || value === undefined || value === '') return null

  // Already-structured input (provider sent min/max/currency).
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const raw =
      typeof obj.raw === 'string'
        ? obj.raw
        : [obj.min, obj.max].some((v) => v !== undefined)
          ? formatStructured(obj)
          : undefined
    const min = toFinite(obj.min)
    const max = toFinite(obj.max)
    const currency = strOrUndef(obj.currency) ?? fallbackCurrency ?? (raw ? detectCurrency(raw) : undefined)
    const period = strOrUndef(obj.period) as SalaryPeriod | undefined
    const info: SalaryInfo = { raw } as SalaryInfo
    if (min !== undefined) info.min = min
    if (max !== undefined) info.max = max
    if (currency) info.currency = currency
    if (period) info.period = period
    info.normalizable = min !== undefined && Boolean(currency)
    return (info.min === undefined && info.max === undefined && !info.raw)
      ? null
      : info
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    const info: SalaryInfo = {
      min: Math.round(value),
      max: Math.round(value),
      currency: fallbackCurrency ?? undefined,
      period: 'year',
      raw: String(value),
      normalizable: Boolean(fallbackCurrency),
    }
    return info
  }

  if (typeof value !== 'string') return null

  const raw = value.trim()
  if (!raw) return null
  if (NO_SALARY_PATTERNS.some((re) => re.test(raw))) return null

  const numbers = extractNumbers(raw)
  const period = detectPeriod(raw)
  const currency = detectCurrency(raw) ?? fallbackCurrency ?? undefined

  let min: number | undefined
  let max: number | undefined
  if (numbers.length >= 2) {
    min = numbers[0]
    max = numbers[numbers.length - 1]
  } else if (numbers.length === 1) {
    // "From $80k" or "$10/hour"
    if (/\b(from|up to|minimum|starting|max|usd)\b/i.test(raw) || /^-+|^≥/.test(raw)) {
      min = numbers[0]
    } else {
      min = numbers[0]
    }
  }

  const info: SalaryInfo = { raw } as SalaryInfo
  if (min !== undefined) info.min = min
  if (max !== undefined) info.max = max
  if (currency) info.currency = currency
  info.period = period
  info.normalizable = min !== undefined && Boolean(currency)
  return info
}

function formatStructured(obj: Record<string, unknown>): string {
  const parts: string[] = []
  if (obj.min !== undefined) parts.push(String(obj.min))
  if (obj.max !== undefined) parts.push(String(obj.max))
  return parts.length ? parts.join(' – ') : ''
}

function toFinite(v: unknown): number | undefined {
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) && num > 0 ? Math.round(num) : undefined
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Salary period multipliers for display only (never cross-currency conversion). */
export function periodMultiplier(period: SalaryPeriod | undefined): number {
  switch (period) {
    case 'hour':
      return 1920
    case 'day':
      return 240
    case 'week':
      return 48
    case 'month':
      return 12
    default:
      return 1
  }
}

/** Annualized amount in the ORIGINAL currency, for ranking/filtering. */
export function annualizedEquivalent(info: SalaryInfo | null | undefined): number | undefined {
  if (!info || !info.normalizable || info.min === undefined) return undefined
  return Math.round(info.min * periodMultiplier(info.period))
}

/**
 * Hard-filter helper: does the job's salary meet the requested minimum?
 * Only compares within the same currency — a mismatch (or unknown) is `null`
 * so the caller can decide (default: keep the job).
 */
export function salaryMeetsMinimum(
  info: SalaryInfo | null | undefined,
  minimumSalary: number | undefined,
  currency: string | undefined,
): boolean | null {
  if (!minimumSalary || !currency) return true
  if (!info || !info.normalizable || !info.currency) return null
  if (info.currency.toUpperCase() !== currency.toUpperCase()) return null
  const annual = annualizedEquivalent(info)
  if (annual === undefined) return null
  return annual >= minimumSalary
}

/** Human display of a SalaryInfo: "$90k – $120k / yr", "$25 / hr", "Salary not listed". */
export function formatSalary(info: SalaryInfo | null | undefined, currency?: string): string {
  if (!info) return 'Salary not listed'
  const code = (info.currency ?? currency ?? '').toUpperCase()
  const symbol = CURRENCY_SYMBOLS[code] ?? (CODE_FORMAT.test(code) ? `${code} ` : '$')
  const parts: string[] = []
  if (info.min !== undefined) parts.push(formatNumber(info.min, symbol))
  if (info.max !== undefined && info.max !== info.min) parts.push(formatNumber(info.max, symbol))
  if (parts.length === 0) return 'Salary not listed'
  const periodLabel = periodLabelFor(info.period)
  return `${parts.join(' – ')}${periodLabel ? ` ${periodLabel}` : ''}`.trim()
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  CHF: 'CHF ',
  SEK: 'kr ',
  NOK: 'kr ',
  DKK: 'kr ',
  PLN: 'zł ',
  BRL: 'R$',
  MXN: 'MX$',
  INR: '₹',
  SGD: 'S$',
  ZAR: 'R ',
  IDR: 'Rp ',
  HKD: 'HK$',
  JPY: '¥',
  CNY: '¥',
}

function formatNumber(n: number, symbol: string): string {
  if (n >= 1000) {
    const thousands = n / 1000
    return Number.isInteger(thousands) ? `${symbol}${thousands}k` : `${symbol}${thousands.toFixed(1)}k`
  }
  return `${symbol}${n}`
}

function periodLabelFor(period: SalaryPeriod | undefined): string {
  switch (period) {
    case 'year':
      return '/ yr'
    case 'hour':
      return '/ hr'
    case 'month':
      return '/ mo'
    case 'week':
      return '/ wk'
    case 'day':
      return '/ day'
    default:
      return ''
  }
}

/** Returns USD-style ISO code label for a currency code (e.g. USD → USD). */
export function currencyCode(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim().toUpperCase()
  return CODE_FORMAT.test(trimmed) ? trimmed : undefined
}