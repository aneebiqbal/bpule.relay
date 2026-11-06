import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Compatibility: the rep scorecard is part of the V4 Home; admins use /admin/command. */
export default function AccountabilityRedirect() {
  redirect('/dashboard')
}
