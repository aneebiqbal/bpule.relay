import { describe, expect, it, vi } from 'vitest'
import { requestMemo, runWithRequestScope } from '@/lib/request-scope'
import '@/lib/request-scope.node'

/**
 * One `/api/profiles?assigned=1` request used to run `getCurrentUser()` seven
 * times (14 DB reads) and `getSession()` fourteen times, because React's
 * `cache()` only memoizes inside a render pass. At ~650 ms per round trip that
 * was the whole 30 s response.
 */
describe('requestMemo', () => {
  it('loads once per key within a request scope', async () => {
    await runWithRequestScope(async () => {
      const load = vi.fn().mockResolvedValue({ id: 1 })
      const a = await requestMemo('k', load)
      const b = await requestMemo('k', load)
      expect(a).toEqual({ id: 1 })
      expect(b).toBe(a)
      expect(load).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps different keys independent', async () => {
    await runWithRequestScope(async () => {
      const a = requestMemo('a', async () => 1)
      const b = requestMemo('b', async () => 2)
      expect(await a).toBe(1)
      expect(await b).toBe(2)
    })
  })

  it('does not leak a value from one scope into another', async () => {
    await runWithRequestScope(async () => {
      const load = vi.fn().mockResolvedValue('value')
      expect(await requestMemo('shared', load)).toBe('value')
      expect(load).toHaveBeenCalledTimes(1)
    })
    await runWithRequestScope(async () => {
      const load = vi.fn().mockResolvedValue('value')
      expect(await requestMemo('shared', load)).toBe('value')
      expect(load).toHaveBeenCalledTimes(1)
    })
  })

  it('shares one promise between concurrent callers', async () => {
    await runWithRequestScope(async () => {
      let resolve!: (value: string) => void
      const load = vi.fn().mockImplementation(() => new Promise<string>((r) => { resolve = r }))
      const a = requestMemo('race', load)
      const b = requestMemo('race', load)
      resolve('done')
      expect(await a).toBe('done')
      expect(await b).toBe('done')
      expect(load).toHaveBeenCalledTimes(1)
    })
  })

  it('runs the loader when there is no scope', async () => {
    const load = vi.fn().mockResolvedValue(7)
    expect(await requestMemo('orphan', load)).toBe(7)
  })
})
