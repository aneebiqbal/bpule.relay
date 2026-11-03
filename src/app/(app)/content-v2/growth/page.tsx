import { GrowthTodayV2 } from '@/components/studio-v2/growth-today-v2'
import { requireProductAdmin } from '@/lib/auth/admin-page'

export const dynamic = 'force-dynamic'

export default async function GrowthV2Page() {
  // Auth context is the canonical authority — reps.role alone can be stale
  // after a role change (see isProductAdmin).
  await requireProductAdmin()

  return <GrowthTodayV2 />
}
