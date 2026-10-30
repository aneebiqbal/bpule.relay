import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Operational accountability now lives in /admin/command. History lives in Insights. */
export default function AdminAccountabilityRedirect() {
  redirect('/admin/command')
}
