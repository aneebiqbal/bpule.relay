/**
 * Runtime re-assertion of live-test database isolation.
 *
 * The vitest config already asserts this before collection; this second gate
 * runs after workers start, so a mutated environment cannot slip past it.
 */
import { assertLiveTestIsolation, describeDatabaseTarget } from '@/lib/db/test-isolation'

export default function setup(): void {
  assertLiveTestIsolation()
  console.log(`[live-test-isolation] target: ${describeDatabaseTarget()}`)
}
