import { Clock } from 'lucide-react'
import type { BestTimeResult } from '@/lib/content/best-time'

/**
 * Personalized best-time-to-post, from this person's own logged history
 * only. Below the sample minimum, says plainly there isn't enough data yet —
 * never shows a weak pattern dressed up as reliable, and never states a
 * generic "best time to post" claim.
 */
export function BestTimeCard({ result }: { result: BestTimeResult }) {
  return (
    <section className="rounded-2xl border border-line/60 bg-surface-raised p-5">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-studio" aria-hidden="true" />
        <h2 className="text-heading text-base text-ink">Your best time to post</h2>
      </div>

      {!result.ready ? (
        <p className="mt-2 text-sm text-slate">
          Not enough data yet — {result.loggedCount} of {result.minRequired} posts logged with real results.
          Log results on a few more posts and a pattern from your own history will show up here.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-ink">
            Based on {result.loggedCount} logged posts, your <span className="font-medium">{result.topHourRange}</span> window has performed best.
          </p>
          <div className="space-y-1">
            {result.buckets.slice(0, 4).map((b, i) => (
              <div key={b.label} className="flex items-center justify-between text-xs text-slate">
                <span className={i === 0 ? 'font-medium text-ink' : ''}>{b.label}</span>
                <span>{b.postCount} post{b.postCount === 1 ? '' : 's'} · avg {Math.round(b.avgEngagement)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate">This is your own pattern only, not a general claim about best times to post.</p>
        </div>
      )}
    </section>
  )
}
