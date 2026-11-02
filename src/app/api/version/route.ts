import { NextResponse } from 'next/server'
import { SCORING_VERSION } from '@/lib/intelligence-v3/versions'
import { BUYER_INTENT_VERSION } from '@/lib/intelligence-v3/buyer-intent'
import { APP_VERSION } from '@/lib/version'
import { describeDbProvider } from '@/lib/db/provider'
import { describeAuthProvider } from '@/lib/auth/provider'

export const runtime = 'nodejs'
// Dynamic so the provider names reflect the deployment's runtime environment
// rather than whatever was set when the route was prerendered.
export const dynamic = 'force-dynamic'

// Evaluated once when the route is prerendered at build time.
const BUILT_AT = new Date().toISOString()

/**
 * Read-only build identity, so a deployed runtime can be compared with the
 * intended source. Values come from Vercel's build metadata when present;
 * otherwise `sha` is null and the deploy is reported as unidentified.
 * Nothing here is a secret.
 */
export function GET() {
  const sha =
    process.env.RELAY_GIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    ?? process.env.GIT_COMMIT_SHA
    ?? null
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? null
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? null
  return NextResponse.json(
    {
      sha,
      shortSha: sha ? sha.slice(0, 7) : null,
      ref,
      deploymentId,
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      buildTime: process.env.BUILD_TIME ?? BUILT_AT,
      appVersion: APP_VERSION,
      scoringVersion: SCORING_VERSION,
      buyerIntentVersion: BUYER_INTENT_VERSION,
      // Which backends this deployment actually reads and writes through.
      // No secret is included — provider names only.
      ...describeDbProvider(),
      ...describeAuthProvider(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
