import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

export interface RateCardProps {
  title: string
  value: number | null
  target: number
  caption?: string
}

function pct(n: number | null): string {
  if (n === null) return 'no data'
  return `${Math.round(n * 100)}%`
}

export function RateCard({ title, value, target, caption }: RateCardProps) {
  const filled = value === null ? 0 : Math.min(Math.round((value / target) * 100), 100)
  const onTarget = value !== null && value >= target

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-2xl font-semibold ${onTarget ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
          >
            {pct(value)}
          </span>
          <span className="text-xs text-muted-foreground">
            target {pct(target)}
          </span>
        </div>
        <Progress value={filled} className="h-2" />
        {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
      </CardContent>
    </Card>
  )
}