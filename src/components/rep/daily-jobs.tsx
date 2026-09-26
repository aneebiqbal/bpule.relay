'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from 'cn'

export interface DailyJob {
  key: string
  title: string
  hint: string
  done: number
  goal: number
  href: string
  button: string
}

const ORDER = [
  'prospect_extracted',
  'connection_request',
  'dm',
  'followup',
  'email',
  'application',
  'proposal',
]

const COPY: Record<string, { title: string; hint: string; href: string; button: string }> = {
  prospect_extracted: {
    title: 'Pull profiles',
    hint: 'Find people before you send.',
    href: '/prospect',
    button: 'Pull profiles',
  },
  connection_request: {
    title: 'Send connection notes',
    hint: 'Ask to connect. Do not pitch yet.',
    href: '/leads?filter=connect',
    button: 'Send notes',
  },
  dm: {
    title: 'Send first messages',
    hint: 'Only after they accept.',
    href: '/leads?filter=dm',
    button: 'Send messages',
  },
  followup: {
    title: 'Follow up',
    hint: 'Write again if they went quiet.',
    href: '/leads?filter=followup',
    button: 'Follow up',
  },
  email: {
    title: 'Send emails',
    hint: 'Email is a separate list.',
    href: '/revenue/email',
    button: 'Open email',
  },
  application: {
    title: 'Upwork applications',
    hint: 'Apply to jobs that fit.',
    href: '/upwork',
    button: 'Apply',
  },
  proposal: {
    title: 'Upwork proposals',
    hint: 'Send the proposal after you apply.',
    href: '/upwork',
    button: 'Send proposals',
  },
}

export function jobsFromTargets(
  identities: Array<{ targets: Array<{ activityType: string; targetCount: number; completedCount: number; remaining: number }> }>,
): DailyJob[] {
  const totals = new Map<string, { done: number; goal: number }>()
  for (const identity of identities) {
    for (const target of identity.targets) {
      if (target.targetCount <= 0) continue
      const current = totals.get(target.activityType) ?? { done: 0, goal: 0 }
      current.done += target.completedCount
      current.goal += target.targetCount
      totals.set(target.activityType, current)
    }
  }

  const keys = [
    ...ORDER.filter((key) => totals.has(key)),
    ...[...totals.keys()].filter((key) => !ORDER.includes(key)),
  ]

  return keys.map((key) => {
    const counts = totals.get(key) ?? { done: 0, goal: 0 }
    const copy = COPY[key] ?? {
      title: key.replaceAll('_', ' '),
      hint: 'Finish this number.',
      href: '/leads',
      button: 'Open',
    }
    return {
      key,
      title: copy.title,
      hint: copy.hint,
      done: counts.done,
      goal: counts.goal,
      href: copy.href,
      button: copy.button,
    }
  })
}

export function dayVerdict(doneJobs: number, openJobs: number, workingDay: boolean): {
  tone: 'won' | 'start' | 'push' | 'off'
  title: string
  detail: string
} {
  if (!workingDay) {
    return {
      tone: 'off',
      title: 'Day off',
      detail: 'Numbers are not due today. Still answer anyone who replied.',
    }
  }
  if (openJobs === 0 && doneJobs > 0) {
    return {
      tone: 'won',
      title: 'Day won',
      detail: 'You covered every number. Pull more profiles if you want a bigger day.',
    }
  }
  if (doneJobs === 0) {
    return {
      tone: 'start',
      title: 'Not started',
      detail: 'Nothing is done yet. Start at the first open job. The day is not done until every bar is full.',
    }
  }
  return {
    tone: 'push',
    title: `${openJobs} still open`,
    detail: 'Finish the red rows. You get the day win only when every number is covered.',
  }
}

export function paceReading(done: number, goal: number, now: Date): {
  expected: number
  gap: number
  label: string
  tone: 'ahead' | 'behind' | 'even' | 'waiting' | 'closed' | 'won'
} {
  if (goal <= 0) return { expected: 0, gap: 0, label: 'No numbers today', tone: 'waiting' }
  if (done >= goal) return { expected: goal, gap: 0, label: 'Every number is covered', tone: 'won' }
  const minutes = now.getHours() * 60 + now.getMinutes()
  const start = 9 * 60
  const end = 17 * 60
  if (minutes < start) return { expected: 0, gap: done, label: 'Window opens at 9. Anything you send now is ahead.', tone: 'waiting' }
  if (minutes >= end) {
    return { expected: goal, gap: done - goal, label: `${goal - done} still open after the window`, tone: 'closed' }
  }
  const fraction = (minutes - start) / (end - start)
  const expected = Math.round(goal * fraction)
  const gap = done - expected
  if (gap >= 1) return { expected, gap, label: `${gap} ahead of the clock`, tone: 'ahead' }
  if (gap <= -1) return { expected, gap, label: `${Math.abs(gap)} behind the clock`, tone: 'behind' }
  return { expected, gap: 0, label: 'Right on the clock', tone: 'even' }
}

export function workWindowLabel(now: Date): { text: string; running: boolean } {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const start = 9 * 60
  const end = 17 * 60
  const format = (total: number) => {
    const hours = Math.floor(total / 60)
    const mins = total % 60
    if (hours <= 0) return `${mins}m`
    return mins ? `${hours}h ${mins}m` : `${hours}h`
  }
  if (minutes < start) return { text: `Work starts in ${format(start - minutes)}`, running: false }
  if (minutes >= end) return { text: 'Work window is closed', running: false }
  return { text: `${format(end - minutes)} left`, running: true }
}

export function DailyJobs({
  jobs,
  workingDay,
  profilesPulled = 0,
}: {
  jobs: DailyJob[]
  workingDay: boolean
  profilesPulled?: number
}) {
  const [clock, setClock] = useState(() => workWindowLabel(new Date()))
  useEffect(() => {
    const tick = () => setClock(workWindowLabel(new Date()))
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])
  const doneJobs = jobs.filter((job) => job.done >= job.goal).length
  const openJobs = jobs.length - doneJobs
  const verdict = dayVerdict(doneJobs, openJobs, workingDay)
  const firstOpen = workingDay ? jobs.find((job) => job.done < job.goal) : null
  const unitsDone = jobs.reduce((sum, job) => sum + Math.min(job.done, job.goal), 0)
  const unitsGoal = jobs.reduce((sum, job) => sum + job.goal, 0)
  const unitsPct = unitsGoal > 0 ? Math.round((unitsDone / unitsGoal) * 100) : 0
  const pace = workingDay
    ? paceReading(unitsDone, unitsGoal, new Date())
    : { expected: 0, gap: 0, label: 'Numbers are not due today', tone: 'waiting' as const }
  const ring = 2 * Math.PI * 28

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'p') {
        event.preventDefault()
        window.location.href = '/prospect'
        return
      }
      if (key === 'n' && firstOpen) {
        event.preventDefault()
        window.location.href = firstOpen.href
        return
      }
      const index = Number(key) - 1
      const job = jobs[index]
      if (job && key >= '1' && key <= '9') {
        event.preventDefault()
        window.location.href = job.href
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jobs, firstOpen])

  return (
    <>
    <section className="overflow-hidden rounded-lg border border-line bg-bone-raised" aria-label="Today's jobs">
      <div className={cn(
        'px-4 py-4',
        verdict.tone === 'won' && 'bg-status-success/10',
        verdict.tone === 'start' && 'bg-status-danger/10',
        verdict.tone === 'push' && 'bg-orange/10',
      )}>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Today</p>
        <h2 className="mt-1 text-[22px] font-medium tracking-[-0.02em] text-ink">{verdict.title}</h2>
        <p className="mt-1 max-w-xl text-[14px] text-graphite">{verdict.detail}</p>
        <div className="mt-4 flex items-center gap-4">
          <svg viewBox="0 0 72 72" className="size-16 shrink-0" aria-hidden>
            <circle cx="36" cy="36" r="28" fill="none" stroke="var(--line)" strokeWidth="6" />
            <circle
              cx="36"
              cy="36"
              r="28"
              fill="none"
              stroke={pace.tone === 'won' ? 'var(--status-success)' : pace.tone === 'behind' || pace.tone === 'closed' ? 'var(--status-danger)' : 'var(--orange)'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(unitsPct / 100) * ring} ${ring}`}
              transform="rotate(-90 36 36)"
            />
            <text x="36" y="40" textAnchor="middle" fontSize="14" fill="var(--ink)">{unitsPct}%</text>
          </svg>
          <div className="min-w-0">
            <p className={cn(
              'text-[15px] font-medium',
              pace.tone === 'behind' || pace.tone === 'closed' ? 'text-status-danger' : pace.tone === 'ahead' || pace.tone === 'won' ? 'text-status-success' : 'text-ink',
            )}>{pace.label}</p>
            <p className="mt-1 text-[12px] text-graphite">
              {pace.tone === 'waiting' || pace.tone === 'won' ? clock.text : `Clock expects ${pace.expected}. You have ${unitsDone}.`}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-line/70">
            <div className={cn('h-full rounded-full', verdict.tone === 'won' ? 'bg-status-success' : 'bg-orange')} style={{ width: `${unitsPct}%` }} />
          </div>
          <span className="shrink-0 text-[13px] font-medium tabular-nums text-ink">{unitsDone}/{unitsGoal}</span>
        </div>
        <p className="mt-2 text-[13px] text-ink">
          {jobs.length > 0 ? `${doneJobs} of ${jobs.length} jobs covered` : 'No numbers assigned'}
          {workingDay ? ` · ${clock.text}` : ''}
        </p>
        <p className="mt-1 text-[12px] text-stone">Shortcuts: P pull profiles · N next open job · 1–{Math.min(9, jobs.length) || 1} jump</p>
        {workingDay && clock.running && doneJobs === 0 && jobs.length > 0 && (
          <p className="mt-1 text-[13px] font-medium text-status-danger">The clock is running and nothing is sent yet.</p>
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        <Link
          href="/prospect"
          className="flex items-center justify-between gap-3 rounded-md border border-line bg-bone px-3 py-3 hover:bg-bone-raised"
        >
          <div>
            <p className="text-[14px] font-medium text-ink">Pull profiles</p>
            <p className="text-[12px] text-graphite">
              {profilesPulled} pulled today. Find as many as you can. That is what you send from.
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-stone">P</kbd>
            <span className="rounded bg-ink px-3 py-1.5 text-[12px] font-medium text-bone">Pull</span>
          </span>
        </Link>
      </div>

      <ol className="divide-y divide-line/70">
        {jobs.map((job, index) => {
          const covered = job.done >= job.goal
          const pct = job.goal > 0 ? Math.min(100, Math.round((job.done / job.goal) * 100)) : 0
          const isNext = firstOpen?.key === job.key
          return (
            <li key={job.key} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-ink">
                    {index + 1}. {job.title}
                    {isNext && <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-orange">Do this</span>}
                  </p>
                  <p className="text-[12px] text-graphite">{job.hint}</p>
                </div>
                <p className={cn('shrink-0 text-[18px] font-medium tabular-nums', covered ? 'text-status-success' : 'text-ink')}>
                  {job.done}<span className="text-[13px] font-normal text-stone">/{job.goal}</span>
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-line/70">
                <div
                  className={cn('h-full rounded-full', covered ? 'bg-status-success' : 'bg-orange')}
                  style={{ width: `${covered ? 100 : pct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                {!covered && workingDay ? (
                  <Link href={job.href} className="inline-flex text-[13px] font-medium text-orange">
                    {job.button} · {job.goal - job.done} left
                  </Link>
                ) : (
                  <p className="text-[12px] font-medium text-status-success">{covered ? 'Covered' : 'Paused'}</p>
                )}
                <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-stone">{index + 1}</kbd>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
    {firstOpen && <div className="h-16" aria-hidden />}
    {firstOpen && (
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-bone-raised/95 px-4 py-3 backdrop-blur lg:bottom-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.12em] text-stone">Keep going · N</p>
            <p className="truncate text-[14px] font-medium text-ink">{firstOpen.title} · {firstOpen.goal - firstOpen.done} left</p>
          </div>
          <Link href={firstOpen.href} className="shrink-0 rounded bg-orange px-3 py-2 text-[13px] font-medium text-on-accent">
            {firstOpen.button}
          </Link>
        </div>
      </div>
    )}
    </>
  )
}
