import { redirect } from 'next/navigation'
import { requireProductAdmin } from '@/lib/auth/admin-page'
import { ChannelsAdmin } from '@/components/admin/channels-admin'

export const dynamic = 'force-dynamic'

/** Admin → Work Setup → Channels. The catalog that feeds Work Setup. */
export default async function AdminChannelsPage() {
  await requireProductAdmin()
  return <ChannelsAdmin />
}
