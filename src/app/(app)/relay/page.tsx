import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Compatibility: the old Relay inbox was rebuilt as /chats. */
export default function RelayInboxRedirect() {
  redirect('/chats')
}
