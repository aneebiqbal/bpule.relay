'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface ProfileData {
  id: string
  fullName: string | null
  displayName: string | null
  headline: string | null
  currentRole: string | null
  company: string | null
  location: string | null
  bio: string | null
  professionalSummary: string | null
  seniority: string | null
  yearsExperience: number | null
  primarySkills: string[]
  secondarySkills: string[]
  technologies: string[]
  industries: string[]
  specialties: string[]
  positioning: string | null
  differentiators: string[]
  languages: string[]
  readiness: string
  profileConfidence: number | null
  sourceCount: number
  proofCount: number
  aiContext: Record<string, unknown>
  assignments: Array<{ id: string; rep: { id: string; name: string } }>
  rep: { name: string } | null
  sources: Array<{ id: string; originalFilename: string; parsingStatus: string; uploadedAt: string }>
  reviews: Array<{ id: string; reviewText: string; reviewerName: string | null; safeForOutreach: boolean }>
  proofCards: Array<{ id: string; capability: string; strength: string; safeClaim: string; verified: boolean }>
  portfolioProjects: Array<{ id: string; projectTitle: string; myRole: string | null; description: string | null }>
}

export function ProfileDetail({ profileId }: { profileId: string }) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/profile-intelligence/profiles/${profileId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile)
        else setError(data.error ?? 'Profile not found')
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [profileId])

  if (loading) return <div className="p-6 text-[12px] text-[color:var(--console-mute)]">Loading...</div>
  if (error) return <div className="p-6 text-[12px] text-red-500">{error}</div>
  if (!profile) return null

  return (
    <div className="space-y-6 p-5 sm:p-6">
      <div className="flex items-center gap-2 text-[11px] text-[color:var(--console-mute)]">
        <Link href="/profile-intelligence" className="hover:text-orange">Profiles</Link>
        <span>/</span>
        <span className="text-[color:var(--console-text)]">{profile.fullName ?? profile.displayName ?? 'Profile'}</span>
      </div>

      {/* Identity */}
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Identity</p>
        <h1 className="mt-2 text-[24px] leading-[1.1] tracking-[-0.02em] text-[color:var(--console-text)]">
          {profile.fullName ?? profile.displayName ?? 'Unnamed'}
        </h1>
        {profile.currentRole && (
          <p className="mt-1 text-[13px] text-[color:var(--console-mute)]">
            {profile.currentRole}{profile.company ? ` · ${profile.company}` : ''}
          </p>
        )}
        {profile.headline && (
          <p className="mt-2 text-[12px] text-[color:var(--console-mute)]">{profile.headline}</p>
        )}
        <div className="mt-3 flex gap-2">
          {profile.readiness === 'ready' && (
            <span className="rounded bg-green-500/10 px-2 py-0.5 text-[10px] text-green-600">Ready</span>
          )}
          {profile.seniority && (
            <span className="rounded bg-orange/5 px-2 py-0.5 text-[10px] text-orange/80">{profile.seniority}</span>
          )}
          {profile.yearsExperience != null && (
            <span className="rounded bg-orange/5 px-2 py-0.5 text-[10px] text-orange/80">{profile.yearsExperience}+ yrs exp</span>
          )}
          <span className="rounded bg-orange/5 px-2 py-0.5 text-[10px] text-[color:var(--console-mute)]">
            {profile.sourceCount} sources · {profile.proofCount} proofs
          </span>
        </div>
      </section>

      {/* Capabilities */}
      {(profile.primarySkills?.length > 0 || profile.technologies?.length > 0) && (
        <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Best At</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.primarySkills?.map((s) => (
              <span key={s} className="rounded bg-orange/10 px-2 py-0.5 text-[11px] text-orange">{s}</span>
            ))}
            {profile.technologies?.filter((t) => !profile.primarySkills?.includes(t)).map((t) => (
              <span key={t} className="rounded border border-orange/10 px-2 py-0.5 text-[11px] text-[color:var(--console-mute)]">{t}</span>
            ))}
          </div>
          {profile.specialties?.length > 0 && (
            <p className="mt-2 text-[11px] text-[color:var(--console-mute)]">
              <span className="font-medium">Specialties:</span> {profile.specialties.join(', ')}
            </p>
          )}
        </section>
      )}

      {/* Summary */}
      {(profile.professionalSummary || profile.bio) && (
        <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Summary</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--console-text)]">
            {profile.professionalSummary ?? profile.bio}
          </p>
        </section>
      )}

      {/* Projects */}
      {profile.portfolioProjects?.length > 0 && (
        <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Projects</p>
          <div className="mt-3 space-y-3">
            {profile.portfolioProjects.map((p) => (
              <div key={p.id} className="border-l-2 border-orange/20 pl-3">
                <p className="text-[12px] font-medium text-[color:var(--console-text)]">
                  {p.projectTitle}
                  {p.myRole && <span className="text-[color:var(--console-mute)]"> — {p.myRole}</span>}
                </p>
                {p.description && (
                  <p className="mt-1 text-[11px] text-[color:var(--console-mute)]">{p.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Proof */}
      {profile.proofCards?.length > 0 && (
        <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Proof</p>
          <div className="mt-3 space-y-2">
            {profile.proofCards.map((pc) => (
              <div key={pc.id} className="flex items-start gap-2">
                <span className={`mt-0.5 flex-shrink-0 rounded px-1 text-[9px] font-medium ${
                  pc.strength === 'strong' ? 'bg-green-500/10 text-green-600' :
                  pc.strength === 'moderate' ? 'bg-yellow-500/10 text-yellow-600' :
                  'bg-gray-500/10 text-gray-500'
                }`}>
                  {pc.strength}
                </span>
                <p className="text-[12px] text-[color:var(--console-text)]">{pc.safeClaim}</p>
                {pc.verified && (
                  <span className="flex-shrink-0 text-[9px] text-green-600">verified</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Reviews */}
      {profile.reviews?.length > 0 && (
        <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Reviews</p>
          <div className="mt-3 space-y-3">
            {profile.reviews.map((r) => (
              <div key={r.id} className="border-l-2 border-orange/20 pl-3">
                <p className="text-[12px] italic text-[color:var(--console-text)]">&ldquo;{r.reviewText}&rdquo;</p>
                {r.reviewerName && (
                  <p className="mt-1 text-[10px] text-[color:var(--console-mute)]">— {r.reviewerName}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sources */}
      {profile.sources?.length > 0 && (
        <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Sources</p>
          <div className="mt-3 space-y-1">
            {profile.sources.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-[11px]">
                <span className="text-[color:var(--console-text)]">{s.originalFilename}</span>
                <span className={`rounded px-1 text-[9px] ${
                  s.parsingStatus === 'parsed' ? 'bg-green-500/10 text-green-600' : 'bg-gray-500/10 text-gray-500'
                }`}>{s.parsingStatus}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Assignment */}
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Assignment</p>
        <p className="mt-2 text-[12px] text-[color:var(--console-text)]">
          {profile.assignments?.length > 0
            ? `Assigned to: ${profile.assignments.map((a) => a.rep.name).join(', ')}`
            : 'Not assigned'}
        </p>
      </section>
    </div>
  )
}
