import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { StudioLayout } from '@/components/studio-layout'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function StudioJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const persona = await store.getContentPersona(id)
  if (!persona) redirect('/content')

  const journey = await store.listContentJourney?.(id, 50) ?? []

  const safePersona = JSON.parse(JSON.stringify(persona)) as typeof persona

  return (
    <StudioLayout persona={safePersona}>
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <header className="srf-sheet mark-corners relative px-5 py-6 sm:px-7">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Studio / Journey</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Your Journey</h1>
          <p className="mt-1 text-sm text-graphite">
            Your professional story. Relay uses this to suggest better content.
          </p>
        </header>

        {journey.length === 0 ? (
          <div className="rounded border border-dashed border-line p-8 text-center">
            <p className="text-sm text-graphite">
              No journey entries yet. As you post and interact, your journey builds automatically.
            </p>
          </div>
        ) : (
          <div className="relative space-y-0">
            {/* Timeline line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-ink/10" />

            {journey.map((entry) => (
              <div key={entry.id} className="relative flex gap-4 pb-6">
                {/* Dot */}
                <div className="relative z-10 mt-1.5 h-8 w-8 flex-shrink-0 rounded-full border-2 border-white bg-ink/10 flex items-center justify-center">
                  <EventDot type={entry.eventType} />
                </div>
                {/* Content */}
                <div className="flex-1 rounded border border-line bg-bone-raised p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-graphite">
                      {formatEventType(entry.eventType)}
                    </span>
                    {entry.source === 'ai_inferred' && (
                      <span className="rounded-full bg-orange/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-dark">
                        Suggested
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink">{entry.title}</p>
                  {entry.description && (
                    <p className="mt-0.5 text-xs text-graphite">{entry.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudioLayout>
  )
}

function EventDot({ type }: { type: string }) {
  const colors: Record<string, string> = {
    joined: 'bg-cobalt',
    shipped: 'bg-status-success',
    learned: 'bg-status-warning',
    posted: 'bg-orange',
    milestone: 'bg-orange-dark',
    project: 'bg-cobalt-dark',
    role_change: 'bg-cobalt-light',
    other: 'bg-stone',
  }
  const color = colors[type] ?? colors.other
  return <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
}

function formatEventType(type: string): string {
  const labels: Record<string, string> = {
    joined: 'Joined',
    shipped: 'Shipped',
    learned: 'Learned',
    posted: 'Posted',
    milestone: 'Milestone',
    project: 'Project',
    role_change: 'Role Change',
    other: 'Event',
  }
  return labels[type] ?? 'Event'
}
