import { notFound } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { StudioTodayV2 } from '@/components/studio-v2/studio-today-v2'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StudioTodayV2Page({ params }: PageProps) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) notFound()

  const store = await createScoutStore()
  const persona = await store.getContentPersona(id)
  if (!persona) notFound()
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') notFound()

  return (
    <StudioTodayV2
      personaId={persona.id}
      personaName={persona.personaRole ?? 'Persona'}
      displayName={persona.displayName}
    />
  )
}
