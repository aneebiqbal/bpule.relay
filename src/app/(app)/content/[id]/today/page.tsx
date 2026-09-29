import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function StudioTodayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const persona = await store.getContentPersona(id)
  if (!persona) redirect('/content')
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') redirect('/content')

  redirect(`/content-v2/${id}/today`)
}
