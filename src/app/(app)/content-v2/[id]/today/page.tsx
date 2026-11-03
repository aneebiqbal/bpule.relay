import { redirect } from 'next/navigation'

/** Compatibility: Studio moved to Content → /content?persona=<id>. */
export default async function LegacyStudioTodayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/content?persona=${id}`)
}
