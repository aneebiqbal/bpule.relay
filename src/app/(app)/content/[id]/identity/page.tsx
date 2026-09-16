import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { StudioLayout } from '@/components/studio-layout'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function StudioIdentityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const persona = await store.getContentPersona(id)
  if (!persona) redirect('/content')

  const profile = persona.contentProfileId ? await store.getContentProfile(persona.contentProfileId) : null

  const safePersona = JSON.parse(JSON.stringify(persona)) as typeof persona

  return (
    <StudioLayout persona={safePersona}>
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <header className="srf-sheet mark-corners relative px-5 py-6 sm:px-7">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Studio / Identity</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Content Identity</h1>
          <p className="mt-1 text-sm text-graphite">
            Everything Relay knows about you. Edit freely — Relay adapts.
          </p>
        </header>

        {/* About */}
        <section className="rounded border border-line bg-bone-raised p-4">
          <h2 className="text-sm font-medium text-ink">About</h2>
          <div className="mt-2 space-y-1">
            <p className="text-sm text-graphite"><span className="text-ink font-medium">Name:</span> {persona.displayName}</p>
            <p className="text-sm text-graphite"><span className="text-ink font-medium">Role:</span> {profile?.role || 'Not set'}</p>
            <p className="text-sm text-graphite"><span className="text-ink font-medium">Seniority:</span> {profile?.seniority || 'Not set'}</p>
            {persona.personaCompany && (
              <p className="text-sm text-graphite"><span className="text-ink font-medium">Company:</span> {persona.personaCompany}</p>
            )}
          </div>
        </section>

        {/* Known For */}
        {profile && profile.expertise.length > 0 && (
          <section className="rounded border border-line bg-bone-raised p-4">
            <h2 className="text-sm font-medium text-ink">Known For</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.expertise.map((exp) => (
                <span key={exp.area} className="rounded-full bg-cobalt/10 px-2.5 py-0.5 text-xs font-medium text-cobalt-dark">
                  {exp.area} · {exp.level}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Audiences */}
        {profile && profile.audiences && profile.audiences.length > 0 && (
          <section className="rounded border border-line bg-bone-raised p-4">
            <h2 className="text-sm font-medium text-ink">Audience</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.audiences.map((aud) => (
                <span key={aud} className="rounded-full bg-status-success/10 px-2.5 py-0.5 text-xs font-medium text-status-success">
                  {aud}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Territories */}
        {profile && profile.territories && profile.territories.length > 0 && (
          <section className="rounded border border-line bg-bone-raised p-4">
            <h2 className="text-sm font-medium text-ink">Content Territories</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.territories.map((terr) => (
                <span key={terr} className="rounded-full bg-orange/10 px-2.5 py-0.5 text-xs font-medium text-orange-dark">
                  {terr}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Perspective / Opinions */}
        {profile && profile.opinions.length > 0 && (
          <section className="rounded border border-line bg-bone-raised p-4">
            <h2 className="text-sm font-medium text-ink">Perspective</h2>
            <div className="mt-2 space-y-2">
              {profile.opinions.map((op) => (
                <div key={op.belief.slice(0, 30)} className="rounded-lg bg-bone p-2.5">
                  <p className="text-xs italic text-ink">&ldquo;{op.belief}&rdquo;</p>
                  <p className="mt-0.5 text-[10px] text-graphite">{op.strength} confidence</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Journey summary */}
        {profile && profile.experiences.length > 0 && (
          <section className="rounded border border-line bg-bone-raised p-4">
            <h2 className="text-sm font-medium text-ink">Key Experiences</h2>
            <div className="mt-2 space-y-1.5">
              {profile.experiences.map((exp) => (
                <div key={exp.description.slice(0, 30)} className="text-xs text-graphite">
                  <span className="font-medium text-ink capitalize">{exp.type}:</span> {exp.description.slice(0, 80)}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Voice */}
        {persona.humorStyle && (
          <section className="rounded border border-line bg-bone-raised p-4">
            <h2 className="text-sm font-medium text-ink">Voice</h2>
            <p className="mt-1 text-sm text-graphite capitalize">{persona.humorStyle}</p>
          </section>
        )}

        {/* Empty state */}
        {!profile && (
          <div className="rounded border border-dashed border-line p-8 text-center">
            <p className="text-sm text-graphite">
              Complete onboarding to build your Content Identity.
            </p>
          </div>
        )}
      </div>
    </StudioLayout>
  )
}
