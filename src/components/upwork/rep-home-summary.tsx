'use client'

/**
 * Rep Home Upwork summary — compact, canonical facts only.
 * Ready to apply, follow-ups due and client replies. Nothing more.
 */
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { followUpDueAt } from '@/lib/upwork/lifecycle'
import { V4Panel, V4PanelHeader } from '@/components/v4/primitives'

interface UpworkSummaryJob {
  id: string
  title: string
  status?: string
  submittedAt?: string | null
  firstReplyAt?: string | null
  followUps?: string[]
}

export function UpworkRepHomeSummary({ jobs, now }: { jobs: UpworkSummaryJob[]; now: number }) {
  if (jobs.length === 0) return null
  const nowIso = new Date(now).toISOString()
  const readyToApply = jobs.filter((job) => job.status === 'SAVED' || job.status === 'DRAFT_READY').length
  const clientReplies = jobs.filter((job) => job.status === 'CLIENT_REPLIED' || job.firstReplyAt).length
  const followUpsDue = jobs.filter((job) => {
    if (job.status !== 'APPLIED' || job.firstReplyAt) return false
    const due = followUpDueAt(job.submittedAt ?? null, job.followUps ?? [], job.firstReplyAt ?? null)
    return due != null && due <= nowIso
  }).length

  return (
    <section aria-label="Upwork">
      <V4Panel>
        <V4PanelHeader
          eyebrow="Upwork"
          title="Your Upwork week"
          hint={`${readyToApply} ready to apply · ${followUpsDue} follow-ups due · ${clientReplies} client ${clientReplies === 1 ? 'reply' : 'replies'}`}
          action={
            <Link
              href="/upwork"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-graphite transition-colors hover:text-ink"
            >
              Open Upwork
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
      </V4Panel>
    </section>
  )
}
