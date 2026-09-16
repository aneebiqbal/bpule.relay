import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { StudioLayout } from '@/components/studio-layout'
import { redirect } from 'next/navigation'

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

  const safePersona = JSON.parse(JSON.stringify(persona)) as typeof persona

  return (
    <StudioLayout persona={safePersona}>
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <header className="srf-sheet mark-corners relative px-5 py-6 sm:px-7">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Studio / Library</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Library</h1>
          <p className="mt-1 text-sm text-graphite">Your drafts and published posts.</p>
        </header>

        {draftsByStatus.draft.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-graphite">
              Drafts
            </h2>
            <div className="space-y-2">
              {draftsByStatus.draft.map((draft) => (
                <div key={draft.id} className="rounded border border-line bg-bone-raised p-3">
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
                <div key={entry.id} className="rounded border border-line bg-bone-raised p-3">
                  <p className="text-sm text-ink line-clamp-2">{entry.openingLine?.slice(0, 150)}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="rounded-full bg-status-success/10 px-1.5 py-0.5 text-[10px] font-medium text-status-success">
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
          <div className="rounded border border-dashed border-line p-8 text-center">
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
    draft: 'bg-bone text-graphite',
    ready: 'bg-cobalt/10 text-cobalt-dark',
    posted: 'bg-status-success/10 text-status-success',
    rejected: 'bg-status-danger/10 text-status-danger',
  }
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${styles[status] ?? styles.draft}`}>
      {status}
    </span>
  )
}
