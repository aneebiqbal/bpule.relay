import Link from 'next/link'
import { requireProductAdmin } from '@/lib/auth/admin-page'
import { V4Panel, V4PanelHeader } from '@/components/v4/primitives'

export const dynamic = 'force-dynamic'

/**
 * Admin → System / Quality: one secondary entry for the engineering and
 * quality tools, so they never sit beside the daily operating surfaces.
 */
export default async function AdminSystemPage() {
  await requireProductAdmin()

  const tools = [
    {
      href: '/admin/health',
      name: 'Release Health',
      body: 'Live operating signals: model traffic, Inbox sends, task throughput, coverage activations and daily active reps.',
    },
    {
      href: '/admin/qa',
      name: 'QA & Trust',
      body: 'Routing agreement, score staleness, thread trust, model comparison, funnel, message and thesis review.',
    },
    {
      href: '/admin/scoring-qa',
      name: 'Scoring QA',
      body: 'Inspect and repair lead scores against the canonical qualification contract.',
    },
    {
      href: '/facts',
      name: 'Fact Guardrails',
      body: 'The approved claims draft output may use. Everything else is stripped before a human sees it.',
    },
    {
      href: '/admin/dataset',
      name: 'Dataset',
      body: 'Intelligence samples captured across the funnel for review and training.',
    },
    {
      href: '/admin/training-data',
      name: 'Training Data',
      body: 'Labels, pairwise comparisons and learning health for the scoring models.',
    },
    {
      href: '/admin/ai-usage',
      name: 'AI Usage',
      body: 'Spend, failures and latency from persisted model traces.',
    },
    {
      href: '/admin/providers',
      name: 'Provider Discovery',
      body: 'Prospeo / Snov status, daily credit budgets and the saved searches that feed Fresh Prospects.',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Admin / System</p>
        <h1 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">System &amp; quality</h1>
        <p className="mt-1 text-[13px] text-graphite">
          Engineering and quality tooling. These are not daily operating surfaces.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {tools.map((tool) => (
          <Link key={tool.href} href={tool.href}>
            <V4Panel className="h-full transition-colors hover:border-ink/20">
              <V4PanelHeader title={tool.name} />
              <p className="mt-2 text-[13px] leading-relaxed text-graphite">{tool.body}</p>
            </V4Panel>
          </Link>
        ))}
      </div>
    </div>
  )
}
