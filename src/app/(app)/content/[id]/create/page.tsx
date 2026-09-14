import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { StudioLayout } from '@/components/studio-layout'
import { StudioQuickCapture } from '@/components/studio-quick-capture'
import type { QuickCaptureAngle } from '@/lib/domain/types'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function StudioCreatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const persona = await store.getContentPersona(id)
  if (!persona) redirect('/content')

  const safePersona = JSON.parse(JSON.stringify(persona)) as typeof persona

  return (
    <StudioLayout persona={safePersona}>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Create</h1>
          <p className="mt-1 text-sm text-graphite">
            Tell Relay what you worked on or thought about today.
          </p>
        </header>

        <StudioQuickCapture personaId={id} />

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-graphite">
            Or start from an idea
          </h2>
          <a
            href={`/content/${id}/today`}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm text-ink hover:border-ink/30"
          >
            See today&apos;s ideas
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </section>
      </div>
    </StudioLayout>
  )
}
