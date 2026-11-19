import { describe, expect, it } from 'vitest'
import { isSafeApplicationUrl } from '@/lib/job-discovery/url'

describe('isSafeApplicationUrl', () => {
  it('allows public http(s) application destinations', () => {
    expect(isSafeApplicationUrl('https://boards.greenhouse.io/acme/jobs/1')).toBe(true)
    expect(isSafeApplicationUrl('https://acme.com/careers/apply')).toBe(true)
  })

  it('rejects private, loopback and non-http destinations', () => {
    expect(isSafeApplicationUrl('http://localhost:3000/apply')).toBe(false)
    expect(isSafeApplicationUrl('http://127.0.0.1/apply')).toBe(false)
    expect(isSafeApplicationUrl('http://10.0.0.5/apply')).toBe(false)
    expect(isSafeApplicationUrl('http://192.168.1.20/apply')).toBe(false)
    expect(isSafeApplicationUrl('http://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isSafeApplicationUrl('http://[::1]/apply')).toBe(false)
    expect(isSafeApplicationUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeApplicationUrl('not a url')).toBe(false)
    expect(isSafeApplicationUrl(null)).toBe(false)
  })
})
