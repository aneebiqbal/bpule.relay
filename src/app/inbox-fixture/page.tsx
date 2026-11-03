import { InboxFixture } from '@/components/inbox/inbox-fixture'
import { SalesHeader } from '@/components/sales/sales-header'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * Visual-development fixture for the V3 Inbox. Deterministic, no auth, no
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
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="mb-3 flex items-center gap-2 text-[12px] text-stone md:hidden">
        <Link href="/inbox-fixture" className="inline-flex items-center gap-1 hover:text-ink">
          <ArrowLeft className="size-3.5" aria-hidden /> Inbox
        </Link>
        <span aria-hidden>/</span>
        <span>Fixture</span>
      </div>

      <SalesHeader
        title="Inbox"
        eyebrow="Conversations"
        description={
          manager
            ? 'Your team’s client conversations, most urgent first. 8 conversations need you.'
            : 'Your client conversations as Mehak LinkedIn, most urgent first. 8 conversations need you.'
        }
        meta={
          <div className="flex items-center gap-1 rounded-lg border border-line bg-bone-raised p-0.5 text-[12px]">
            {(['rep', 'manager', 'admin'] as const).map((r) => (
              <Link
                key={r}
                href={`/inbox-fixture?role=${r}`}
                className={
                  r === role
                    ? 'rounded-md bg-solid px-2.5 py-1 font-medium text-on-solid'
                    : 'px-2.5 py-1 text-graphite hover:text-ink'
                }
              >
                {r === 'rep' ? 'Rep' : r === 'manager' ? 'Manager' : 'Admin'}
              </Link>
            ))}
          </div>
        }
      />

      <div className="mt-4">
        <InboxFixture showOwner={manager} />
      </div>

      <p className="mt-3 text-[11px] text-stone">
        Fixture data — deterministic, no database. Used for visual review only.
      </p>
    </div>
  )
}
