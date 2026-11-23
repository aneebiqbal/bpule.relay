import { requireProductAdmin } from '@/lib/auth/admin-page'
import { WorkSetupManager } from '@/components/operations/work-setup'

export const dynamic = 'force-dynamic'

/**
 * Admin → Work Setup. The ONE surface for assigning people to accounts and
 * setting/allocating their daily work. The legacy per-person target editor is
 * retired; its route stays so existing bookmarks resolve.
 */
export default async function TargetsPage() {
  await requireProductAdmin()
  return <WorkSetupManager />
}
