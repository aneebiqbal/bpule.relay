import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Compatibility: the daily persona post moved into Studio → /content. */
export default function PersonaDailyRedirect() {
  redirect('/content')
}
