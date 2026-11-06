import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Compatibility: assigned profiles live on the Rep Home and Team → Profiles. */
export default function AssignedProfilesRedirect() {
  redirect('/dashboard')
}
