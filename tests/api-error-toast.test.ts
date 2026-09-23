import { describe, expect, it } from 'vitest'
import { duplicateNotice, isApiMutation, toastFromApiError } from '@/lib/ui/api-error-toast'

describe('api error toasts', () => {
  it('turns a hard duplicate save into a named toast', () => {
    const toast = toastFromApiError(409, {
      blocked: true,
      duplicate: true,
      duplicateKind: 'hard',
      reason: 'This contact already exists under this company.',
      existingOwnerName: 'Madiha',
      existingLeadId: 'b5a2dbcc-c187-48d9-bda5-fcba143bb93c',
      existingLeadCompany: '101domain.com',
      canCreateSeparate: false,
    })

    expect(toast.title).toBe('Already a lead')
    expect(toast.description).toBe(
      'This contact already exists under 101domain.com. Madiha owns it.',
    )
    expect(toast.variant).toBe('destructive')
    expect(toast.action).toEqual({
      label: 'View existing',
      href: '/leads/b5a2dbcc-c187-48d9-bda5-fcba143bb93c',
    })
  })

  it('keeps a potential duplicate distinct and still links the existing lead', () => {
    const toast = duplicateNotice({
      duplicateKind: 'potential',
      reason: 'Potential duplicate: this company name is very similar to an existing lead.',
      existingLeadCompany: 'Northwind',
      existingLeadId: 'lead-2',
    })
    expect(toast.title).toBe('Possible duplicate')
    expect(toast.variant).toBe('info')
    expect(toast.action?.href).toBe('/leads/lead-2')
    expect(toast.description).toContain('Northwind')
  })

  it('does not call every 409 a duplicate', () => {
    const toast = toastFromApiError(409, { error: 'Day already closed.' })
    expect(toast.title).toBe('Not saved')
    expect(toast.description).toBe('Day already closed.')
  })

  it('uses the server error string for ordinary failures', () => {
    expect(toastFromApiError(422, { error: 'NOT ENOUGH INFORMATION.' }).title).toBe('Not enough to save')
    expect(toastFromApiError(500, { error: 'Lead was not created. Please try again.' }).description).toContain(
      'Lead was not created',
    )
  })

  it('only toasts mutating calls to this app’s API', () => {
    expect(isApiMutation('/api/prospect/save', 'POST', 'https://relay.bpulse.dev')).toBe(true)
    expect(isApiMutation('https://relay.bpulse.dev/api/leads', 'POST', 'https://relay.bpulse.dev')).toBe(true)
    expect(isApiMutation('/api/me/status', 'GET', 'https://relay.bpulse.dev')).toBe(false)
    expect(isApiMutation('https://example.com/api/leads', 'POST', 'https://relay.bpulse.dev')).toBe(false)
  })
})
