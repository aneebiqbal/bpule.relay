'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ContentPersona } from '@/lib/domain/types'

interface StudioLayoutProps {
  persona: ContentPersona
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: '', label: 'Today', icon: TodayIcon },
  { href: '/create', label: 'Create', icon: CreateIcon },
  { href: '/journey', label: 'Journey', icon: JourneyIcon },
  { href: '/library', label: 'Library', icon: LibraryIcon },
  { href: '/identity', label: 'Identity', icon: IdentityIcon },
]

export function StudioLayout({ persona, children }: StudioLayoutProps) {
  const pathname = usePathname()
  const personaId = persona.id

  return (
    <div className="flex min-h-screen flex-col bg-bone lg:flex-row">
      {/* Sidebar Navigation */}
      <aside className="border-b border-ink/10 bg-white lg:w-56 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-3 lg:block lg:px-4 lg:py-5">
          <div>
            <p className="text-xs text-graphite">Studio</p>
            <p className="text-sm font-medium text-ink truncate">{persona.displayName}</p>
          </div>
          <Link
            href="/content"
            className="rounded-lg border border-ink/15 px-2 py-1 text-xs text-graphite hover:border-ink/30 lg:hidden"
          >
            Switch
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:gap-0.5 lg:px-3 lg:pb-4">
          {NAV_ITEMS.map((item) => {
            const href = `/content/${personaId}${item.href}`
            const isActive = pathname === href || (item.href !== '' && pathname.startsWith(href))
            return (
              <Link
                key={item.href}
                href={href}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-ink text-bone'
                    : 'text-graphite hover:bg-ink/5 hover:text-ink'
                }`}
              >
                <item.icon active={isActive} />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="hidden border-t border-ink/10 px-4 py-3 lg:block">
          <Link href="/content" className="text-xs text-graphite hover:text-ink">
            ← All Personas
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

function TodayIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  )
}

function CreateIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  )
}

function JourneyIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  )
}

function LibraryIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function IdentityIcon({ active }: { active: boolean }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )
}
