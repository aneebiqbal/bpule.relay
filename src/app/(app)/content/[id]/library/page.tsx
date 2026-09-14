import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { StudioLayout } from '@/components/studio-layout'
import { redirect } from 'next/navigation'
import type { ContentDraftStatus } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

export default async function StudioLibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const persona = await store.getContentPersona(id)
  if (!persona) redirect('/content')

  const drafts = await store.listContentDrafts(id)
  const history = await store.listContentHistory(id, 50)

  const draftsByStatus = {
    draft: drafts.filter((d) => d.status === 'draft' || d.status === 'ready'),
    posted: history.slice(0, 20),
    rejected: drafts.filter((d) => d.status === 'rejected'),
  }

  return (
    <StudioLayout persona={persona}>
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Library</h1>
          <p className="mt-1 text-sm text-graphite">Your drafts and published posts.</p>
        </header>

        {draftsByStatus.draft.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-graphite">
              Drafts
            </h2>
            <div className="space-y-2">
              {draftsByStatus.draft.map((draft) => (
                <div key={draft.id} className="rounded-lg border border-ink/10 bg-white p-3">
                  <p className="text-sm text-ink line-clamp-2">{draft.caption?.slice(0, 150) || '(No caption)'}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusBadge status={draft.status} />
                    <span className="text-[10px] text-graphite">{draft.platform}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {draftsByStatus.posted.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-graphite">
              Published
            </h2>
            <div className="space-y-2">
              {draftsByStatus.posted.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-ink/10 bg-white p-3">
                  <p className="text-sm text-ink line-clamp-2">{entry.openingLine?.slice(0, 150)}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                      Posted
                    </span>
                    <span className="text-[10px] text-graphite">{entry.platform}</span>
                    <span className="text-[10px] text-graphite">
                      {new Date(entry.postedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {draftsByStatus.draft.length === 0 && draftsByStatus.posted.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink/20 p-8 text-center">
            <p className="text-sm text-graphite">
              No drafts or posts yet. Go to Today to create your first post.
            </p>
          </div>
        )}
      </div>
    </StudioLayout>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    ready: 'bg-blue-50 text-blue-700',
    posted: 'bg-green-50 text-green-700',
    rejected: 'bg-red-50 text-red-600',
  }
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${styles[status] ?? styles.draft}`}>
      {status}
    </span>
  )
}
