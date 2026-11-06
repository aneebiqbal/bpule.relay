import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Compatibility: profile details live under Team → Profiles. */
export default async function ProfileIntelligenceDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/team/profiles/${id}`)
}
