import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Superseded by /admin/command, which reads the canonical team-day contract. */
export default function CommandCenterRedirect() {
  redirect('/admin/command')
}
