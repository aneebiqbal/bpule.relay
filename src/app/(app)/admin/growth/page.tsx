import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Compatibility: growth reporting moved to Content → /content/growth. */
export default function AdminGrowthRedirect() {
  redirect('/content/growth')
}
