import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const persona = await store.getContentPersona(id)
  if (!persona) redirect('/content')

  // Verify ownership
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') redirect('/content')

  // Redirect to Today — the proper Studio entry point
  redirect(`/content/${id}/today`)
}
