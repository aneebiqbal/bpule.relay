import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Legacy Account 360 entry. The canonical account page is /accounts/[company]
 * (bounded reads, scoped, tabbed). Settings lives at /settings.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; companyKey?: string }>
}) {
  const { companyKey } = await searchParams
  if (!companyKey) redirect('/settings')
  redirect(`/accounts/${encodeURIComponent(companyKey)}`)
}
