/**
 * Release gate (Phase 9 / 34).
 *
 * Runs every automated gate in order and prints one human-readable report.
 * Returns non-zero on any failure, so CI can gate on it.
 *
 *   node scripts/qa/qa-release.mjs
 */
import { execFileSync } from 'node:child_process'
import { gitSha, readApiVersion } from './release-lib.mjs'

const STEPS = [
  { name: 'PRODUCT CONTRACTS', command: ['node', 'scripts/qa/contract-coverage.mjs'] },
  { name: 'SEMANTIC BUYER QUESTIONS', command: ['npx', 'vitest', 'run', 'tests/qa-relay-semantic-buyer-questions.test.ts', '--silent'] },
  { name: 'MESSAGE QUALITY', command: ['npx', 'vitest', 'run', 'tests/qa-relay-message-quality-invariants.test.ts', '--silent'] },
  { name: 'REGRESSION CORPUS', command: ['npx', 'vitest', 'run', 'tests/relay-regression-corpus.test.ts', '--silent'] },
  { name: 'LEAD PARITY', command: ['npx', 'vitest', 'run', 'tests/qa-relay-cross-surface-parity.test.ts', '--silent'] },
  { name: 'CONTRACT OWNERS', command: ['npx', 'vitest', 'run', 'tests/relay-contract-owners.test.ts', '--silent'] },
  { name: 'TYPECHECK', command: ['npx', 'tsc', '--noEmit'] },
  { name: 'LINT', command: ['npx', 'eslint'] },
  { name: 'UNIT', command: ['npx', 'vitest', 'run', '--silent'] },
  { name: 'BUILD', command: ['npx', 'next', 'build'] },
]

function runStep(step) {
  try {
    execFileSync(step.command[0], step.command.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
      env: process.env,
    })
    return { ok: true, detail: '' }
  } catch (err) {
    const stderr = err.stderr?.toString().slice(-2000) ?? ''
    return { ok: false, detail: stderr }
  }
}

function main() {
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
  console.log(
    `SHA VERIFIED      ${version ? 'PENDING (run qa:deployed)' : 'NOT VERIFIED (no /api/version reachable)'}`,
  )

  console.log('==================')
  if (failures > 0) {
    console.error(`RELEASE GATE: FAIL (${failures} step(s) failed)`)
    process.exit(1)
  }
  console.log('RELEASE GATE: PASS')
}

main()
