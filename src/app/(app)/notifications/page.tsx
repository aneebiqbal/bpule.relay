import Link from 'next/link'
import { Bell } from 'lucide-react'
import { cn } from 'cn'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineError, LinkTabs, relativeTime } from '@/components/operations/ops-primitives'
import { MarkAllReadButton } from '@/components/operations/mark-all-read-button'
import { NotificationOpenLink } from '@/components/operations/notification-open-link'
import { requireOpsContext } from '@/lib/operations/page-context'
import { getDatabaseCapabilities, NOT_AVAILABLE_MESSAGE } from '@/lib/operations/capabilities'
import { opsHref } from '@/lib/operations/filters'
import {
  NOTIFICATION_CATEGORIES,
  toRelayNotification,
  type NotificationCategory,
  type NotificationRow,
  type RelayNotification,
} from '@/lib/notifications/model'

export const dynamic = 'force-dynamic'

const FETCH_LIMIT = 100

/**
 * Notifications — the canonical center. Recipient-only rows from the
 * notifications table, Unread / All, filtered by category. Every row
 * deep-links to the record it is about.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOpsContext()
  const sp = await searchParams
  const view = (Array.isArray(sp.view) ? sp.view[0] : sp.view) === 'all' ? 'all' : 'unread'
  const rawCategory = Array.isArray(sp.category) ? sp.category[0] : sp.category
  const category = NOTIFICATION_CATEGORIES.some((c) => c.value === rawCategory) ? (rawCategory as NotificationCategory) : null
  const capabilities = await getDatabaseCapabilities(ctx.client)

  let items: RelayNotification[] | null = null
  if (capabilities.notifications) {
    let q = ctx.client
      .from('notifications')
      .select('id, notification_type, title, body, link, read, created_at')
      .eq('organization_id', ctx.auth.orgId)
      .eq('recipient_id', ctx.auth.repId)
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT)
    if (view === 'unread') q = q.eq('read', false)
    const { data, error } = await q
    items = error ? null : ((data ?? []) as NotificationRow[]).map(toRelayNotification)
  }

  const visible = items?.filter((n) => !category || n.category === category) ?? []
  const counts = new Map<NotificationCategory, number>()
  for (const n of items ?? []) counts.set(n.category, (counts.get(n.category) ?? 0) + 1)

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="Replies, tasks, assignments and requests that need you. Nothing here is a page view or a draft."
        action={items && items.some((n) => !n.read) ? <MarkAllReadButton /> : undefined}
      />

      {!capabilities.notifications ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-graphite">Notifications: {NOT_AVAILABLE_MESSAGE}.</p>
      ) : items === null ? (
        <InlineError>Notifications could not be loaded. Refresh to try again.</InlineError>
      ) : (
        <>
          <LinkTabs
            label="Notification views"
            active={view}
            tabs={[
              { value: 'unread', label: 'Unread', href: opsHref('/notifications', { category }, {}) },
              { value: 'all', label: 'All', href: opsHref('/notifications', { category, view: 'all' }) },
            ]}
          />
          <nav aria-label="Notification categories" className="flex flex-wrap gap-1.5">
            <Link
              href={opsHref('/notifications', { view: view === 'all' ? 'all' : null })}
              aria-current={!category ? 'page' : undefined}
              className={cn('rounded-full border px-2.5 py-0.5 text-[12px]', !category ? 'border-orange bg-orange/10 text-ink' : 'border-line text-graphite hover:text-ink')}
            >
              Everything
            </Link>
            {NOTIFICATION_CATEGORIES.map((c) => (
              <Link
                key={c.value}
                href={opsHref('/notifications', { view: view === 'all' ? 'all' : null, category: c.value })}
                aria-current={category === c.value ? 'page' : undefined}
                className={cn('rounded-full border px-2.5 py-0.5 text-[12px]', category === c.value ? 'border-orange bg-orange/10 text-ink' : 'border-line text-graphite hover:text-ink')}
              >
                {c.label}
                <span className="ml-1 tabular-nums text-stone">{counts.get(c.value) ?? 0}</span>
              </Link>
            ))}
          </nav>

          {visible.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={view === 'unread' ? 'You’re all caught up' : 'No notifications yet'}
              description={view === 'unread' ? 'Nothing unread in this category.' : 'Replies, tasks and requests will appear here.'}
            />
          ) : (
            <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line" aria-label="Notifications, newest first">
              {visible.map((n) => (
                <li key={n.id}>
                  <NotificationOpenLink id={n.id} href={n.href} unread={!n.read} className={cn('flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-bone-raised', !n.read && 'bg-orange/5')}>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {!n.read && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-orange align-middle" aria-hidden="true" />}
                        {!n.read && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </span>
                      <span className="block truncate text-[12px] text-graphite">
                        {NOTIFICATION_CATEGORIES.find((c) => c.value === n.category)?.label}
                        {n.body ? ` · ${n.body}` : ''}
                      </span>
                    </span>
                    <time dateTime={n.createdAt} className="shrink-0 text-[11px] tabular-nums text-stone">
                      {relativeTime(n.createdAt, Date.now())}
                    </time>
                  </NotificationOpenLink>
                </li>
              ))}
            </ul>
          )}
          {items.length >= FETCH_LIMIT && <p className="text-[12px] text-graphite">Showing the latest {FETCH_LIMIT}.</p>}
        </>
      )}
    </div>
  )
}
