import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  CalendarPlus,
  Briefcase,
  PenLine,
  ArrowRight,
  Target,
  Sparkles,
} from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/current'
import { RelayBrand } from '@/components/brand'

export const dynamic = 'force-dynamic'

const PATHS = [
  {
    id: 'clients',
    icon: Target,
    title: 'Find clients',
    description: 'Reach out to people who need your work.',
    color: 'orange',
    cta: 'Check a prospect',
    href: '/prospect',
  },
  {
    id: 'meetings',
    icon: CalendarPlus,
    title: 'Book more meetings',
    description: 'Turn conversations into calls.',
    color: 'orange',
    cta: 'See who to follow up',
    href: '/',
  },
  {
    id: 'work',
    icon: Briefcase,
    title: 'Find work',
    description: 'Apply to jobs that actually fit.',
    color: 'orange',
    cta: 'Browse jobs',
    href: '/upwork',
  },
  {
    id: 'presence',
    icon: PenLine,
    title: 'Build my professional presence',
    description: 'Publish content that attracts opportunities.',
    color: 'cobalt',
    cta: 'Open Studio',
    href: '/content',
  },
]

export default async function ActivatePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const firstName = user.rep.name.split(' ')[0]

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <RelayBrand />
          <Link
            href="/dashboard"
            className="text-[13px] text-graphite transition-colors hover:text-ink"
          >
            Skip for now
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          <div className="text-center">
            <h1 className="text-display text-[28px] text-ink sm:text-[32px]">
              Welcome, {firstName}.
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-graphite">
              What are you here to do? We will personalize Relay around your answer.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {PATHS.map((path) => (
              <Link
                key={path.id}
                href={path.href}
                className="group flex flex-col rounded-xl border border-line bg-bone-raised p-5 text-left transition-all hover:border-line hover:shadow-sm"
              >
                <div className={path.color === 'cobalt'
                  ? 'flex size-9 items-center justify-center rounded-lg bg-cobalt/10'
                  : 'flex size-9 items-center justify-center rounded-lg bg-orange/10'}
                >
                  <path.icon className={path.color === 'cobalt' ? 'size-4 text-cobalt' : 'size-4 text-orange'} aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-[14px] font-medium text-ink">{path.title}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-graphite">{path.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-orange opacity-0 transition-opacity group-hover:opacity-100">
                  {path.cta} <ArrowRight className="size-3" />
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-8 rounded-lg border border-line bg-bone p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-orange" aria-hidden="true" />
              <p className="text-[13px] leading-relaxed text-graphite">
                You can do all of these. This just helps us show you the right things first.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-3xl px-6 py-3">
          <p className="text-center text-mono-regular text-[11px] text-stone">
            You can change this later in Settings.
          </p>
        </div>
      </footer>
    </div>
  )
}
