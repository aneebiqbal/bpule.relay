import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { StudioLayout } from '@/components/studio-layout'
import { StudioQuickCapture } from '@/components/studio-quick-capture'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <header className="srf-sheet mark-corners relative px-5 py-6 sm:px-7">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Studio / Create</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Capture today&apos;s signal</h1>
          <p className="mt-1 text-sm text-graphite">
            Tell Relay what you worked on or thought about today.
          </p>
        </header>

        <section className="srf-proof px-4 py-3">
          <p className="text-[12px] text-graphite">
            No guesswork. Use specific events, numbers, and outcomes from your work.
          </p>
        </section>

        <section>
          <StudioQuickCapture personaId={id} />
        </section>

        <section className="srf-proof px-4 py-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-graphite">
            Or start from an idea
          </h2>
          <Link
            href={`/content/${id}/today`}
            className="mt-3 inline-flex items-center gap-2 rounded border border-line px-4 py-2.5 text-sm text-ink hover:border-ink/30"
          >
            See today&apos;s ideas
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </section>
      </div>
    </StudioLayout>
  )
}
