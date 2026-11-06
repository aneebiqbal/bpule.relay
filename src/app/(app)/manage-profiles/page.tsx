import { redirect } from 'next/navigation'

/** Compatibility: the profile directory moved to Team → Profiles. */
export default function ManageProfilesRedirect() {
  redirect('/team/profiles')
}
