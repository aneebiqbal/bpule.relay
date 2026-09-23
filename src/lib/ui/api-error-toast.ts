import type { ToastInput } from '@/components/ui/toast'

export interface ApiErrorBody {
  error?: unknown
  message?: unknown
  reason?: unknown
  blocked?: unknown
  duplicate?: unknown
  duplicateKind?: unknown
  existingOwnerName?: unknown
  existingLeadId?: unknown
  existingLeadCompany?: unknown
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Plain-language notice for a blocked duplicate save. The raw API body
 * ("hard duplicate", "this company") is what the network tab shows; the
 * toast and the inline alert should name the company and the owner.
 */
export function duplicateNotice(body: ApiErrorBody): ToastInput {
  const kind = body.duplicateKind === 'potential' ? 'potential' : 'hard'
  const company = text(body.existingLeadCompany)
  const owner = text(body.existingOwnerName)
  const leadId = text(body.existingLeadId)
  let description =
    text(body.reason) ??
    (company ? `${company} is already a lead.` : 'This lead already exists.')

  if (company && !description.toLowerCase().includes(company.toLowerCase())) {
    description = description.replace(/this company/i, company)
    if (!description.toLowerCase().includes(company.toLowerCase())) {
      description = description.replace(/\.\s*$/, '')
      description = `${description}. Company: ${company}.`
    }
  }

  if (owner && !description.toLowerCase().includes(owner.toLowerCase())) {
    description = description.replace(/\.\s*$/, '')
    description = `${description}. ${owner} owns it.`
  }

  return {
    title: kind === 'potential' ? 'Possible duplicate' : 'Already a lead',
    description,
    variant: kind === 'potential' ? 'info' : 'destructive',
    action: leadId ? { label: 'View existing', href: `/leads/${leadId}` } : undefined,
  }
}

export function toastFromApiError(status: number, body: unknown): ToastInput {
  const data: ApiErrorBody = body && typeof body === 'object' ? (body as ApiErrorBody) : {}
  if (data.blocked === true || data.duplicate === true || text(data.existingLeadId)) {
    return duplicateNotice(data)
  }

  const message = text(data.error) ?? text(data.message) ?? text(data.reason)
  if (status === 401) {
    return { title: 'Sign in required', description: message ?? 'Your session expired. Sign in and try again.', variant: 'destructive' }
  }
  if (status === 403) {
    return { title: 'Not allowed', description: message ?? 'You do not have access to do that.', variant: 'destructive' }
  }
  if (status === 422) {
    return { title: 'Not enough to save', description: message ?? 'Add more prospect detail, then try again.', variant: 'destructive' }
  }
  if (status === 409) {
    return { title: 'Not saved', description: clip(message ?? 'That conflicts with something already saved.'), variant: 'destructive' }
  }
  if (status >= 500) {
    return { title: 'Something failed', description: clip(message ?? 'The server could not finish that. Try again.'), variant: 'destructive' }
  }
  return {
    title: 'Could not complete that',
    description: clip(message ?? `Request failed (${status}).`),
    variant: 'destructive',
  }
}

function clip(message: string): string {
  return message.length > 280 ? `${message.slice(0, 277)}…` : message
}

export function isApiMutation(url: string, method: string, origin: string): boolean {
  const verb = method.toUpperCase()
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return false
  try {
    const parsed = new URL(url, origin)
    return parsed.origin === origin && parsed.pathname.startsWith('/api/')
  } catch {
    return url.startsWith('/api/')
  }
}
