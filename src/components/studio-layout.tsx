'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ContentPersona } from '@/lib/domain/types'
import { cn } from 'cn'

interface StudioLayoutProps {
  persona: ContentPersona
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: '', label: 'Today' },
  { href: '/create', label: 'Create' },
  { href: '/journey', label: 'Journey' },
  { href: '/library', label: 'Library' },
  { href: '/identity', label: 'Identity' },
]

export function StudioLayout({ persona, children }: StudioLayoutProps) {
  const pathname = usePathname()
  const personaId = persona.id

  return (
    <div className="space-y-4">
      <header className="rounded border border-line bg-bone-raised px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Studio / Create</p>
            <h1 className="mt-1 text-[20px] font-medium tracking-[-0.02em] text-ink">{persona.displayName}</h1>
            <p className="text-[12px] text-graphite">What is worth saying today?</p>
          </div>
          <Link href="/content?manage=1" className="rounded border border-line px-2.5 py-1.5 text-[11px] text-graphite hover:text-ink">
            Switch persona
          </Link>
        </div>
        <nav className="mt-3 flex flex-wrap gap-1">
          {NAV_ITEMS.map((item) => {
            const href = `/content/${personaId}${item.href}`
            const active = pathname === href || (item.href !== '' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'rounded px-2.5 py-1.5 text-[12px] transition-colors',
                  active ? 'bg-cobalt text-on-accent' : 'text-graphite hover:bg-bone hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>
      {children}
    </div>
  )
}
