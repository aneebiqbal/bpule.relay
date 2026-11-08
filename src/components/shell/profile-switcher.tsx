'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { cn } from 'cn'
import { useActiveIdentity } from '@/components/workspace/active-identity-provider'
import type { RepRole } from '@/lib/domain/types'
import type { WorkspaceIdentity } from '@/lib/workspace/active-identity'

export interface ProfileSwitcherProps {
  role: RepRole
  compact?: boolean
  className?: string
}

/**
 * Group a person's channels under one header. The person key is the canonical
 * profile id (personId), so a two-channel person appears once — never as two
 * unrelated names.
 */
function groupIdentitiesByPerson(
  identities: ReadonlyArray<WorkspaceIdentity>,
): Array<{ key: string; name: string; identities: WorkspaceIdentity[] }> {
  const groups: Array<{ key: string; name: string; identities: WorkspaceIdentity[] }> = []
  const byKey = new Map<string, { key: string; name: string; identities: WorkspaceIdentity[] }>()
  for (const identity of identities) {
    const key = identity.personId ?? identity.profileId ?? identity.id
    let group = byKey.get(key)
    if (!group) {
      group = { key, name: identity.identityName, identities: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.identities.push(identity)
  }
  return groups
}

export function ProfileSwitcher({ role, compact, className }: ProfileSwitcherProps) {
  const { identities, active: activeIdentity, selectIdentity } = useActiveIdentity()
  const [identityOpen, setIdentityOpen] = useState(false)

  const orderedIdentities = activeIdentity
    ? [activeIdentity, ...identities.filter((identity) => identity.id !== activeIdentity.id)]
    : identities

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIdentityOpen((open) => !open)}
        aria-expanded={identityOpen}
        className={cn(
          'flex max-w-[220px] items-center gap-2 rounded-md border border-line bg-bone-raised text-left transition-colors hover:border-orange/30',
          compact ? 'px-2 py-1.5' : 'px-2.5 py-2',
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-stone">Working profile</p>
          {activeIdentity ? (
            <>
              <p className="truncate text-[13px] font-medium text-ink">{activeIdentity.identityName}</p>
              <p className="truncate text-[10px] text-stone">
                {[
                  activeIdentity.channel.toUpperCase(),
                  identities.length > 1 ? `${identities.length} profiles assigned` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </>
          ) : (
            <p className="truncate text-[11px] text-graphite">No profile assigned</p>
          )}
        </div>
        <ChevronDown className={cn('size-3.5 shrink-0 text-stone transition-transform', identityOpen && 'rotate-180')} />
      </button>

      {identityOpen && (
        <div className="absolute right-0 top-[calc(100%+0.35rem)] z-50 max-h-72 w-64 overflow-y-auto rounded-md border border-line bg-bone-raised p-1.5 shadow-lg">
          {orderedIdentities.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-graphite">
              {role === 'admin' ? 'No active profiles yet.' : 'No assigned profiles yet.'}
            </p>
          ) : (
            <div className="space-y-1">
              {groupIdentitiesByPerson(orderedIdentities).map((group) => (
                <div key={group.key} className="space-y-0.5">
                  <p className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-stone">
                    {group.name}
                  </p>
                  {group.identities.map((identity) => {
                    const selected = identity.id === activeIdentity?.id
                    return (
                      <button
                        key={identity.id}
                        type="button"
                        onClick={() => {
                          selectIdentity(identity.id)
                          setIdentityOpen(false)
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
                          selected ? 'bg-solid text-on-solid' : 'hover:bg-bone',
                        )}
                      >
                        <span className={cn('size-1.5 shrink-0 rounded-full', selected ? 'bg-orange' : 'bg-stone/40')} />
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium">{identity.identityName}</p>
                          <p className={cn('truncate text-[10px]', selected ? 'text-on-solid/70' : 'text-graphite')}>
                            {[identity.title, identity.channel.toUpperCase()].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
          {role === 'admin' && (
            <Link
              href="/profile-intelligence?tab=identities"
              onClick={() => setIdentityOpen(false)}
              className="mt-1.5 block rounded border border-line px-2 py-1 text-center text-[11px] font-medium text-ink hover:bg-bone"
            >
              Manage identities
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
