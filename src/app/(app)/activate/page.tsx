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
    href: '/dashboard',
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

  const firstName = user.rep.name?.split(' ')[0] ?? 'there'

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="srf-console srf-console-edge overflow-hidden px-5 py-5 sm:px-6">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange-light">Activation / Intent Setup</p>
        <h1 className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] text-[color:var(--console-text)]">
          Welcome, {firstName}. What should Relay prioritize first?
        </h1>
        <p className="mt-2 text-[13px] text-[color:var(--console-mute)]">
          This sets your default focus order. You can change it later in account settings.
        </p>
        <div className="mt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded border border-line/30 px-3 py-1.5 text-[12px] font-medium text-[color:var(--console-mute)] hover:text-[color:var(--console-text)]"
          >
            Skip for now
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {PATHS.map((path) => (
          <Link
            key={path.id}
            href={path.href}
            className="group srf-proof flex flex-col px-4 py-4 text-left transition-all hover:translate-y-[-1px]"
          >
            <div className={path.color === 'cobalt'
              ? 'flex size-9 items-center justify-center rounded bg-cobalt/10'
              : 'flex size-9 items-center justify-center rounded bg-orange/10'}
            >
              <path.icon className={path.color === 'cobalt' ? 'size-4 text-cobalt' : 'size-4 text-orange'} aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-[15px] font-medium text-ink">{path.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-graphite">{path.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-orange">
              {path.cta} <ArrowRight className="size-3" />
            </span>
          </Link>
        ))}
      </section>

      <section className="srf-proof px-4 py-3">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-orange" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-graphite">
            You can pursue all tracks. This only tunes which lane Relay surfaces first.
          </p>
        </div>
      </section>
    </div>
  )
}
