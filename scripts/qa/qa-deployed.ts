/**
 * Deployed SHA check (Phase 10).
 *
 * Calls GET /api/version on a deployment and fails immediately on a SHA, ref or
 * env mismatch. No browser acceptance may run against the wrong build.
 *
 *   npx tsx scripts/qa/qa-deployed.ts --url=<preview-url> --sha=<expected>
 */
import { readApiVersion } from './release-lib'

interface Args {
  url?: string
  sha?: string
  ref?: string
  env?: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = {}
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=')
    if (key && value) args[key as keyof Args] = value
  }
  return args
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (!args.url || !args.sha) {
    console.error('usage: qa:deployed --url=<preview-url> --sha=<expected> [--ref=<branch>] [--env=preview]')
    process.exit(2)
  }

  const version = readApiVersion(args.url)
  if (!version) {
    console.error(`FAIL: GET ${args.url}/api/version did not return a version payload.`)
    process.exit(1)
  }

  console.log(`deployment : ${args.url}`)
  console.log(`reported   : sha=${version.sha ?? 'null'} ref=${version.ref ?? 'null'} env=${version.env ?? 'null'}`)
  console.log(`expected   : sha=${args.sha} ref=${args.ref ?? '(any)'} env=${args.env ?? '(any)'}`)

  const mismatches: string[] = []
  if (version.sha !== args.sha) mismatches.push(`sha ${version.sha ?? 'null'} != ${args.sha}`)
  if (args.ref && version.ref !== args.ref) mismatches.push(`ref ${version.ref ?? 'null'} != ${args.ref}`)
  if (args.env && version.env !== args.env) mismatches.push(`env ${version.env ?? 'null'} != ${args.env}`)

  if (mismatches.length > 0) {
    console.error(`FAIL: deployed build is not the tested build — ${mismatches.join('; ')}`)
    process.exit(1)
  }
  console.log('PASS: deployed SHA matches the tested SHA.')
}

main()
