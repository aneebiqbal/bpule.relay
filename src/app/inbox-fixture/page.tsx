import { InboxFixture } from '@/components/inbox/inbox-fixture'

export const dynamic = 'force-dynamic'

/**
 * Visual-development fixture for the V4 Inbox. Deterministic, no auth, no
 * database — used to screenshot and review the workspace while Neon Auth is
 * unavailable. Not linked from product navigation.
 *
 *   /inbox-fixture            rep view
 *   /inbox-fixture?role=manager
 *   /inbox-fixture?role=admin
 */
export default async function InboxFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const role = sp.role === 'manager' || sp.role === 'admin' ? sp.role : 'rep'
  const manager = role !== 'rep'

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
      <div className="h-dvh">
        <InboxFixture showOwner={manager} className="h-full" />
      </div>
    </div>
  )
}
