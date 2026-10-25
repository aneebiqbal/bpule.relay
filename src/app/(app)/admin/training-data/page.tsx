import { requireProductAdmin } from '@/lib/auth/admin-page'
import { TrainingDataCenter } from '@/components/admin/training-data-center'
import { LearningHealthHeader } from '@/components/admin/learning-health'
import { getAuthContext } from '@/lib/auth/organization'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export default async function TrainingDataPage() {
  await requireProductAdmin()
  const auth = await getAuthContext()
  return (
    <div className="space-y-6">
      {auth ? <LearningHealthHeader orgId={auth.orgId} /> : null}
      <TrainingDataCenter />
    </div>
  )
}
