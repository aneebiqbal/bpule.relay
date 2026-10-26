/**
 * Release gate (Phase 9 / 34).
 *
 * Runs every automated gate in order and prints one human-readable report.
 * Returns non-zero on any failure, so CI can gate on it.
 *
 *   npx tsx scripts/qa/qa-release.ts
 */
import { execFileSync } from 'node:child_process'
import { gitSha, readApiVersion } from './release-lib'

interface Step {
  name: string
  command: string[]
  /** Steps that need the network/build are allowed to be skipped with a reason. */
  optional?: boolean
}

const STEPS: Step[] = [
  { name: 'PRODUCT CONTRACTS', command: ['npx', 'tsx', 'scripts/qa/contract-coverage.ts'] },
  { name: 'REGRESSION CORPUS', command: ['npx', 'vitest', 'run', 'tests/relay-regression-corpus.test.ts', '--silent'] },
  { name: 'LEAD PARITY', command: ['npx', 'vitest', 'run', 'tests/qa-relay-cross-surface-parity.test.ts', '--silent'] },
  { name: 'TYPECHECK', command: ['npx', 'tsc', '--noEmit'] },
  { name: 'LINT', command: ['npx', 'eslint'] },
  { name: 'UNIT', command: ['npx', 'vitest', 'run', '--silent'] },
  { name: 'BUILD', command: ['npx', 'next', 'build'] },
]

function runStep(step: Step): { ok: boolean; skipped: boolean; detail: string } {
  try {
    execFileSync(step.command[0], step.command.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
      env: process.env,
    })
    return { ok: true, skipped: false, detail: '' }
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString().slice(-2000) ?? ''
    return { ok: false, skipped: false, detail: stderr }
  }
}

function main(): void {
  console.log('RELAY RELEASE GATE')
  console.log('==================')
  console.log(`git SHA: ${gitSha()}`)

  let failures = 0
  for (const step of STEPS) {
    const result = runStep(step)
    const status = result.ok ? 'PASS' : 'FAIL'
    if (!result.ok) failures += 1
    console.log(`${step.name.padEnd(20)} ${status}`)
    if (!result.ok && result.detail) console.log(result.detail.split('\n').slice(-12).join('\n'))
  }

  // Deployed SHA parity is reported, not enforced here: the caller names the
  // expected SHA. `qa:deployed` enforces it.
  const version = readApiVersion()
  console.log('------------------')
  console.log(`SHA VERIFIED      ${version ? 'PENDING (run qa:deployed)' : 'NOT VERIFIED (no /api/version reachable)'}`)

  console.log('==================')
  if (failures > 0) {
    console.error(`RELEASE GATE: FAIL (${failures} step(s) failed)`)
    process.exit(1)
  }
  console.log('RELEASE GATE: PASS')
}

main()
