import { describe, expect, it } from 'vitest'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolvePgSslConfig } from '@/lib/db/ssl'

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n'

describe('resolvePgSslConfig', () => {
  it('disables TLS only when asked (local development)', () => {
    expect(resolvePgSslConfig({ DATABASE_SSL: 'false' } as NodeJS.ProcessEnv)).toBeUndefined()
  })

  it('keeps the historical insecure default when no CA is configured', () => {
    expect(resolvePgSslConfig({} as NodeJS.ProcessEnv)).toEqual({ rejectUnauthorized: false })
    expect(resolvePgSslConfig({ DATABASE_SSL_VERIFY: 'false' } as NodeJS.ProcessEnv)).toEqual({
      rejectUnauthorized: false,
    })
  })

  it('verifies with an inline Aiven CA PEM', () => {
    const ssl = resolvePgSslConfig({ DATABASE_SSL_CA: PEM } as NodeJS.ProcessEnv)
    expect(ssl?.rejectUnauthorized).toBe(true)
    expect(ssl?.ca).toBe(PEM)
  })

  it('verifies with a CA file path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-ca-'))
    const file = join(dir, 'aiven-ca.pem')
    writeFileSync(file, PEM)
    const ssl = resolvePgSslConfig({ DATABASE_SSL_CA: file } as NodeJS.ProcessEnv)
    expect(ssl?.rejectUnauthorized).toBe(true)
    expect(ssl?.ca).toBe(PEM)
  })

  it('verifies against the system trust store when no CA is supplied', () => {
    const ssl = resolvePgSslConfig({ DATABASE_SSL_VERIFY: 'true' } as NodeJS.ProcessEnv)
    expect(ssl).toEqual({ rejectUnauthorized: true })
  })
})
