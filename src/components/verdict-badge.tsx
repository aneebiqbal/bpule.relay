import { Badge } from '@/components/ui/badge'
import type { Verdict } from '@/lib/domain/types'

const VERDICT_STYLES: Record<Verdict, string> = {
  send: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  research_more:
    'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  skip: 'bg-muted text-muted-foreground',
}

const VERDICT_LABELS: Record<Verdict, string> = {
  send: 'send',
  research_more: 'research more',
  skip: 'skip',
}

export function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return null
  return (
    <Badge className={`border-transparent ${VERDICT_STYLES[verdict]}`}>
      {VERDICT_LABELS[verdict]}
    </Badge>
  )
}