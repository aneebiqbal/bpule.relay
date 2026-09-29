import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { GrowthTodayV2 } from '@/components/studio-v2/growth-today-v2'

export const dynamic = 'force-dynamic'

export default async function GrowthV2Page() {
  const user = await getCurrentUser()
  if (!user || user.rep.role !== 'admin') notFound()

  return <GrowthTodayV2 />
}
