/**
 * Credential scanner. Every paste that will reach a model passes through here
 * first. If the text looks like it contains a live credential or API key, the
 * request is blocked with a clear message instead of forwarded.
 */

export interface SecretScanResult {
  blocked: boolean
  reason?: string
  kind?: string
}

const KEY_PATTERNS: Array<{ kind: string; re: RegExp }> = [
  {
    kind: 'Groq API key',
    re: /\bgsk_[A-Za-z0-9]{16,}\S*\b/,
  },
  {
    kind: 'AI API key',
    re: /\bsk-[A-Za-z0-9]{16,}\S*\b/,
  },
  {
    kind: 'Anthropic API key',
    re: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/,
  },
  {
    kind: 'AWS access key',
    re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    kind: 'Google API key',
    re: /\bAIza[0-9A-Za-z_-]{20,}\b/,
  },
  {
    kind: 'GitHub token',
    re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  },
  {
    kind: 'Stripe secret key',
    re: /\bsk_live_[0-9A-Za-z]{16,}\b/,
  },
  {
    kind: 'Slack token',
    re: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
  },
  {
    kind: 'Supabase service role key',
    re: /\beyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  },
  {
    kind: 'JWT',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    kind: 'private key block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
]

const SECRET_LABELS = /(password|passwd|secret|api[_-]?key|access[_-]?key|token|credential)/i
const DIGITS = /[\w/+=_-]{32,}/

/**
 * True when the text contains something that looks like a live credential
 * that must not be forwarded to a model.
 */
export function scanForSecrets(text: string): SecretScanResult {
  if (!text) return { blocked: false }

  const heading = text.slice(0, 200)
  const hasSecretLabel = SECRET_LABELS.test(heading)

  for (const { kind, re } of KEY_PATTERNS) {
    if (re.test(text)) {
      return {
        blocked: true,
        reason: `${kind} detected. Blocked before it reaches a model. `,
        kind,
      }
    }
  }

  if (hasSecretLabel && DIGITS.test(text.slice(0, 400))) {
    return {
      blocked: true,
      reason:
        'Text opens with a value labeled like a secret (password, token, key) followed by a long string. Not forwarded to a model. ',
      kind: 'labeled secret value',
    }
  }

  return { blocked: false }
}

/** Redact secrets from a string used only for local debug/scoring. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9]{16,}\S*\b/g, '<REDACTED>')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '<REDACTED>')
}