'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Profile {
  id: string
  fullName: string | null
  displayName: string | null
  currentRole: string | null
  company: string | null
  primarySkills: string[]
  specialties: string[]
  readiness: string
  sourceCount: number
  proofCount: number
  updatedAt: string
  assignments: Array<{ rep: { name: string } }>
  rep: { name: string } | null
}

const READINESS_LABELS: Record<string, { label: string; color: string }> = {
  ready: { label: 'Ready', color: '#22c55e' },
  needs_source: { label: 'Needs Source', color: '#f59e0b' },
  needs_review: { label: 'Needs Review', color: '#3b82f6' },
  incomplete: { label: 'Incomplete', color: '#6b7280' },
}

export function ProfileList({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('readiness', filter)
    params.set('limit', '50')
    setLoading(true)
    fetch(`/api/profile-intelligence/profiles?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setProfiles(data.profiles ?? [])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [filter])

  const topExpertise = (p: Profile) => {
    return [...(p.primarySkills ?? []), ...(p.specialties ?? [])].slice(0, 3)
  }

  return (
    <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-medium text-[color:var(--console-text)]">Profiles</h2>
        <div className="flex gap-2">
          {['all', 'ready', 'needs_review', 'incomplete', 'needs_source'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 text-[10px] uppercase tracking-wider ${
                filter === f ? 'bg-orange/10 text-orange' : 'text-[color:var(--console-mute)] hover:text-[color:var(--console-text)]'
              }`}
            >
              {f === 'all' ? 'All' : f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-[12px] text-[color:var(--console-mute)]">Loading...</p>
      ) : profiles.length === 0 ? (
        <p className="mt-4 text-[12px] text-[color:var(--console-mute)]">
          No profiles yet. Upload documents above to get started.
        </p>
      ) : (
        <div className="mt-4 space-y-1">
          {profiles.map((p) => {
            const expertise = topExpertise(p)
            const readiness = READINESS_LABELS[p.readiness] ?? READINESS_LABELS.incomplete
            const assignedTo = p.assignments?.[0]?.rep?.name ?? p.rep?.name ?? 'Unassigned'

            return (
              <Link
                key={p.id}
                href={`/profile-intelligence/${p.id}`}
                className="flex items-center gap-4 rounded border border-orange/10 px-3 py-3 transition-colors hover:bg-orange/5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[color:var(--console-text)] truncate">
                    {p.fullName ?? p.displayName ?? 'Unnamed Profile'}
                  </p>
                  <p className="text-[11px] text-[color:var(--console-mute)] truncate">
                    {p.currentRole ?? 'No role'}{p.company ? ` · ${p.company}` : ''}
                  </p>
                </div>

                {expertise.length > 0 && (
                  <div className="hidden sm:flex gap-1 flex-shrink-0">
                    {expertise.map((skill) => (
                      <span key={skill} className="rounded bg-orange/5 px-1.5 py-0.5 text-[9px] text-orange/80">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3 flex-shrink-0 text-right">
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-medium"
                    style={{ color: readiness.color, backgroundColor: `${readiness.color}15` }}
                  >
                    {readiness.label}
                  </span>
                  <span className="text-[10px] text-[color:var(--console-mute)] hidden sm:inline">
                    {p.proofCount}P · {p.sourceCount}S
                  </span>
                  <span className="text-[10px] text-[color:var(--console-mute)] hidden md:inline w-20 truncate">
                    {assignedTo}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
