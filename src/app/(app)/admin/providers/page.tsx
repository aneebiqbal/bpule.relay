import { requireProductAdmin } from '@/lib/auth/admin-page'
import { ProvidersAdmin } from '@/components/admin/providers-admin'

export const dynamic = 'force-dynamic'

/**
 * Admin → Provider discovery (§33, §34).
 *
 * Houses provider status/budget and saved-search configuration beside the other
 * system tooling — no second admin domain.
 */
export default async function AdminProvidersPage() {
  await requireProductAdmin()
  return <ProvidersAdmin />
}
