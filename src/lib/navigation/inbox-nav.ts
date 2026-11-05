/**
 * Canonical Inbox navigation — the single source of truth.
 *
 * The /chats page tabs, the shell's Inbox config, the command palette and the
 * breadcrumb all derive from this file, so there is exactly one Inbox
 * information architecture. The four primary views are the visible nav; the
 * seven secondary conditions live only inside the Filters drawer and reuse the
 * canonical `view` query values (so old links and saved views keep working).
 */
import { CHAT_VIEWS, type ChatView } from '@/lib/operations/chat-queue'

export interface InboxNavItem {
  /** Stable nav id — used for the active state, not the query string. */
  id: string
  label: string
  /** Canonical `view` query value. */
  value: ChatView
}

/** The four primary views, in order. */
export const INBOX_PRIMARY_VIEWS: InboxNavItem[] = [
  { id: 'needs-reply', label: 'Needs reply', value: 'waiting_me' },
  { id: 'waiting', label: 'Waiting', value: 'waiting_them' },
  { id: 'follow-ups', label: 'Follow-ups', value: 'followups' },
  { id: 'all', label: 'All', value: 'all' },
]

/** Secondary conditions — reachable only through the Filters drawer. */
export const INBOX_SECONDARY_CONDITIONS = CHAT_VIEWS.filter(
  (view) => !INBOX_PRIMARY_VIEWS.some((primary) => primary.value === view.value),
)

/** Role default view: reps open on the work that needs them, managers on All. */
export function inboxDefaultView(managerViews: boolean): ChatView {
  return managerViews ? 'all' : 'waiting_me'
}

/** Canonical href for a primary view. */
export function inboxViewHref(view: ChatView): string {
  return `/chats?view=${view}`
}
