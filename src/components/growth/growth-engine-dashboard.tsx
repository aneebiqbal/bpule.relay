'use client'

import { use, useState, useCallback } from 'react'
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Edit3,
  Sparkles,
  Zap,
  TrendingUp,
  BookOpen,
  Send,
} from 'lucide-react'
import { cn } from 'cn'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import type {
  RelayGrowthMemory,
  RelayGrowthEvent,
  RelayEditorialDecision,
  RelayGrowthDraft,
  RelayContentOpportunity,
} from '@/lib/domain/types'

interface GrowthData {
  repName: string
  orgName: string
  memory: RelayGrowthMemory[]
  events: RelayGrowthEvent[]
  decision: RelayEditorialDecision | null
  draft: RelayGrowthDraft | null
  opportunities: RelayContentOpportunity[]
  today: string
}

export function GrowthEngineDashboard({ dataPromise }: { dataPromise: Promise<GrowthData> }) {
  const data = use(dataPromise)
  const [activeTab, setActiveTab] = useState<'today' | 'memory' | 'events' | 'opportunities' | 'weekly'>('today')

  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Studio
          </p>
          <span className="size-1 rounded-full bg-line" />
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange">
            Relay Growth
          </p>
        </div>
        <h1 className="text-display text-[28px] font-light tracking-[-0.02em] text-ink sm:text-[32px]">
          Today&apos;s Post
        </h1>
        <p className="text-[13px] text-graphite">
          {new Date(data.today).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </header>

      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {(['today', 'memory', 'events', 'opportunities', 'weekly'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'shrink-0 px-3 py-2 text-[12px] font-medium capitalize transition-colors',
              activeTab === tab
                ? 'border-b-2 border-orange text-ink'
                : 'text-graphite hover:text-ink',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'today' && <TodayTab data={data} />}
      {activeTab === 'memory' && <MemoryTab data={data} />}
      {activeTab === 'events' && <EventsTab data={data} />}
      {activeTab === 'opportunities' && <OpportunitiesTab data={data} />}
      {activeTab === 'weekly' && <WeeklyTab />}
    </div>
  )
}

function TodayTab({ data }: { data: GrowthData }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [buildLogInput, setBuildLogInput] = useState('')

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/growth/opportunities/generate', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFeedback(typeof body.error === 'string' ? body.error : 'Failed to generate opportunities.')
        return
      }
      if (body.decision || (Array.isArray(body.opportunities) && body.opportunities.length > 0)) {
        window.location.reload()
        return
      }
      setFeedback(typeof body.message === 'string' ? body.message : 'No opportunities generated.')
    } catch {
      setFeedback('Failed to generate opportunities.')
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const handleSelect = useCallback(async (opportunityId: string) => {
    setIsSubmitting(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/growth/opportunities/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: opportunityId }),
      })
      if (res.ok) {
        window.location.reload()
        return
      }
      setFeedback('Failed to select opportunity.')
    } catch {
      setFeedback('Failed to select opportunity.')
    } finally {
      setIsSubmitting(false)
    }
  }, [])

  const handleFeedback = useCallback(async (status: string, adminFeedback: string) => {
    if (!data.decision) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/growth/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionId: data.decision.id,
          status,
          adminFeedback,
        }),
      })
      if (res.ok) {
        setFeedback(`Post ${status}.`)
        setTimeout(() => window.location.reload(), 1000)
      } else {
        setFeedback('Failed to submit feedback.')
      }
    } catch {
      setFeedback('Failed to submit feedback.')
    } finally {
      setIsSubmitting(false)
    }
  }, [data.decision])

  const handleBuildLog = useCallback(async () => {
    if (!buildLogInput.trim()) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/growth/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'build_log_entry',
          title: 'Build Log Entry',
          rawContent: buildLogInput,
          sourceKind: 'build_log',
        }),
      })
      if (res.ok) {
        setBuildLogInput('')
        setFeedback('Build log entry added.')
        setTimeout(() => window.location.reload(), 1000)
      }
    } catch {
      setFeedback('Failed to add build log entry.')
    } finally {
      setIsSubmitting(false)
    }
  }, [buildLogInput])

  if (!data.decision) {
    return (
      <div className="space-y-4">
        {feedback && (
          <div className="rounded-lg border border-line bg-bone-raised px-3 py-2 text-[12px] text-ink">
            {feedback}
          </div>
        )}
        {data.opportunities.length > 0 ? (
          <section className="space-y-3">
            <p className="text-[13px] text-graphite">
              Select an opportunity to turn it into today&apos;s post.
            </p>
            {data.opportunities.map((opp) => (
              <div key={opp.id} className="rounded-lg border border-line bg-bone-raised p-4">
                <p className="text-[14px] font-medium text-ink">{opp.title}</p>
                <p className="mt-1 text-[13px] text-graphite">{opp.insight}</p>
                <button
                  onClick={() => handleSelect(opp.id)}
                  disabled={isSubmitting}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-orange px-3 py-2 text-[12px] font-medium text-on-accent transition-colors hover:bg-orange-dark disabled:opacity-60"
                >
                  Use this
                </button>
              </div>
            ))}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 text-[12px] font-medium text-graphite hover:text-ink"
            >
              <RefreshCw className={cn('size-3.5', isGenerating && 'animate-spin')} />
              {isGenerating ? 'Generating...' : 'Generate more'}
            </button>
          </section>
        ) : (
          <section className="rounded-lg border border-dashed border-line bg-bone-raised/40 px-6 py-12 text-center">
            <Sparkles className="mx-auto size-8 text-stone" />
            <p className="mt-3 text-[14px] font-medium text-ink">No post selected for today</p>
            <p className="mt-1 max-w-xs mx-auto text-[13px] text-graphite">
              Generate opportunities and select one to create today&apos;s post.
            </p>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-orange px-4 py-2 text-[13px] font-medium text-on-accent transition-colors hover:bg-orange-dark disabled:opacity-60"
            >
              <RefreshCw className={cn('size-4', isGenerating && 'animate-spin')} />
              {isGenerating ? 'Generating...' : 'Generate Opportunities'}
            </button>
          </section>
        )}

        <section className="rounded-lg border border-line bg-bone-raised p-5">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-stone" />
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
              Add to Relay Memory
            </p>
          </div>
          <p className="mt-1 text-[12px] text-graphite">
            Paste something that happened in Relay today. The engine will extract editorial facts.
          </p>
          <textarea
            value={buildLogInput}
            onChange={(e) => setBuildLogInput(e.target.value)}
            placeholder="e.g. We discovered reps couldn't clearly see which Revenue Identities they were responsible for, so we turned assignments into an explicit daily workspace."
            className="mt-3 min-h-[100px] w-full resize-y rounded-md border border-line bg-bone p-3 text-[13px] text-ink outline-none focus:border-orange/50"
          />
          <button
            onClick={handleBuildLog}
            disabled={isSubmitting || !buildLogInput.trim()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-solid px-3 py-2 text-[12px] font-medium text-on-solid transition-colors hover:bg-solid/90 disabled:opacity-60"
          >
            <Send className="size-3.5" />
            Add to Memory
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div className="flex items-center gap-2 rounded-lg border border-status-success/20 bg-status-success/5 px-3 py-2 text-[12px] text-ink">
          <CheckCircle2 className="size-4 text-status-success" />
          <span className="font-medium">{feedback}</span>
        </div>
      )}

      <section className="rounded-lg border border-orange/20 bg-orange/[0.03] p-5">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-orange" />
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange">
            Why This Today
          </p>
        </div>
        <div className="mt-3 space-y-2">
          <ReasonRow label="Selection" value={data.decision.primaryReason} />
          <ReasonRow label="Audience" value={data.decision.audienceReason} />
          <ReasonRow label="Timeliness" value={data.decision.timelinessReason} />
          <ReasonRow label="Evidence" value={data.decision.evidenceReason} />
          {data.decision.takeaway && (
            <ReasonRow label="Takeaway" value={data.decision.takeaway} />
          )}
        </div>
      </section>

      {data.draft ? (
        <section className="rounded-lg border border-line bg-bone-raised p-5">
          <div className="flex items-center justify-between">
            <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
              Post
            </p>
            <div className="flex items-center gap-2">
              <StatusBadge status={data.draft.status} variant="cobalt" />
              {data.draft.qualityScore && (
                <span className="text-[11px] text-stone">
                  Quality: {data.draft.qualityScore}/100
                </span>
              )}
            </div>
          </div>
          {data.draft.caption && (
            <div className="mt-3 rounded-md border border-line bg-bone p-4">
              <p className="text-[14px] leading-relaxed text-ink whitespace-pre-wrap">
                {data.draft.caption}
              </p>
            </div>
          )}
          {data.draft.hook && (
            <p className="mt-2 text-[12px] text-graphite">
              <span className="font-medium text-ink">Hook:</span> {data.draft.hook}
            </p>
          )}
          {data.draft.visualType && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] text-stone">Format:</span>
              <span className="rounded-full border border-line bg-bone px-2 py-0.5 text-[11px] text-graphite">
                {data.draft.visualType.replace(/_/g, ' ')}
              </span>
            </div>
          )}
          {data.draft.qualityNotes && data.draft.qualityNotes.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wide text-stone">Quality Notes</p>
              <ul className="mt-1 space-y-0.5">
                {data.draft.qualityNotes.map((note, i) => (
                  <li key={i} className="text-[11px] text-graphite">• {note}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => handleFeedback('approved', 'approved_unchanged')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-orange px-3 py-2 text-[12px] font-medium text-on-accent transition-colors hover:bg-orange-dark disabled:opacity-60"
            >
              <CheckCircle2 className="size-3.5" />
              Approve
            </button>
            <button
              onClick={() => handleFeedback('edited', 'light_edit')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
            >
              <Edit3 className="size-3.5" />
              Edit
            </button>
            <button
              onClick={() => handleFeedback('regenerated', 'heavy_edit')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
            >
              <RefreshCw className="size-3.5" />
              Another Angle
            </button>
            <button
              onClick={() => handleFeedback('rejected', 'rejected')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-[12px] font-medium text-status-danger transition-colors hover:bg-status-danger/5"
            >
              <XCircle className="size-3.5" />
              Reject
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-line bg-bone-raised/40 px-6 py-8 text-center">
          <p className="text-[13px] text-graphite">Draft not yet generated for this decision.</p>
        </section>
      )}
    </div>
  )
}

function ReasonRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-20 shrink-0 text-[11px] font-medium uppercase tracking-wide text-stone">
        {label}
      </span>
      <span className="text-[13px] text-ink">{value}</span>
    </div>
  )
}

function MemoryTab({ data }: { data: GrowthData }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Product Memory
        </p>
        <span className="text-[11px] text-graphite">{data.memory.length} entries</span>
      </div>
      {data.memory.length === 0 ? (
        <p className="text-[13px] text-graphite">No memory entries yet.</p>
      ) : (
        <div className="space-y-2">
          {data.memory.map((mem) => (
            <div key={mem.id} className="rounded-lg border border-line bg-bone-raised p-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-ink">{mem.title}</span>
                <span className="text-[10px] uppercase tracking-wide text-stone">
                  {mem.memoryType.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-graphite">{mem.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EventsTab({ data }: { data: GrowthData }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Build Log
        </p>
        <span className="text-[11px] text-graphite">{data.events.length} events</span>
      </div>
      {data.events.length === 0 ? (
        <p className="text-[13px] text-graphite">No events yet.</p>
      ) : (
        <div className="space-y-2">
          {data.events.map((event) => (
            <div key={event.id} className="rounded-lg border border-line bg-bone-raised p-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-ink">{event.title}</span>
                <span className="text-[10px] uppercase tracking-wide text-stone">
                  {event.eventType.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-graphite">{event.rawContent}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OpportunitiesTab({ data }: { data: GrowthData }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Opportunities
        </p>
        <span className="text-[11px] text-graphite">{data.opportunities.length} today</span>
      </div>
      {data.opportunities.length === 0 ? (
        <p className="text-[13px] text-graphite">No opportunities generated yet.</p>
      ) : (
        <div className="space-y-2">
          {data.opportunities.map((opp) => (
            <div key={opp.id} className="rounded-lg border border-line bg-bone-raised p-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-ink">{opp.title}</span>
                {opp.selected && <StatusBadge status="Selected" variant="orange" />}
              </div>
              <p className="mt-1 text-[12px] text-graphite">{opp.insight}</p>
              <div className="mt-2 flex gap-2 text-[10px] text-stone">
                <span>{opp.territory}</span>
                <span>·</span>
                <span>{opp.audienceSegment}</span>
                <span>·</span>
                <span>{opp.contentJob}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WeeklyTab() {
  const [review, setReview] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const loadReview = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/growth/weekly-review')
      if (res.ok) {
        const data = await res.json()
        setReview(data.review)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  if (!review) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-graphite">Generate a weekly editorial review.</p>
        <button
          onClick={loadReview}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-solid px-3 py-2 text-[12px] font-medium text-on-solid"
        >
          <TrendingUp className="size-3.5" />
          {loading ? 'Loading...' : 'Generate Weekly Review'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-bone-raised p-5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Week of {review.weekStart} — {review.weekEnd}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Published" value={review.published} />
          <Metric label="Approved" value={review.approved} />
          <Metric label="Rejected" value={review.rejected} />
          <Metric label="Not Today" value={review.notToday} />
        </div>
      </section>

      <section className="rounded-lg border border-line bg-bone-raised p-5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
          Edit Rates
        </p>
        <div className="mt-2 space-y-1">
          <p className="text-[12px] text-graphite">Unchanged: {review.unchangedRate}%</p>
          <p className="text-[12px] text-graphite">Light edit: {review.lightEditRate}%</p>
          <p className="text-[12px] text-graphite">Heavy edit: {review.heavyEditRate}%</p>
        </div>
      </section>

      {review.insights.length > 0 && (
        <section className="rounded-lg border border-line bg-bone-raised p-5">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">
            Insights
          </p>
          <ul className="mt-2 space-y-1">
            {review.insights.map((insight: string, i: number) => (
              <li key={i} className="text-[12px] text-graphite">• {insight}</li>
            ))}
          </ul>
        </section>
      )}

      {review.nextWeekHypothesis && (
        <section className="rounded-lg border border-orange/20 bg-orange/[0.03] p-5">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-orange">
            Next Week&apos;s Hypothesis
          </p>
          <p className="mt-1 text-[13px] text-ink">{review.nextWeekHypothesis}</p>
        </section>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-line bg-bone px-3 py-2">
      <p className="text-mono-medium text-[9px] uppercase tracking-[0.14em] text-stone">{label}</p>
      <p className="mt-0.5 text-[15px] font-medium text-ink">{value}</p>
    </div>
  )
}

export function GrowthEngineSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3.5 w-48" />
      </header>
      <div className="flex gap-1 border-b border-line">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="px-3 py-2">
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40" />
    </div>
  )
}
