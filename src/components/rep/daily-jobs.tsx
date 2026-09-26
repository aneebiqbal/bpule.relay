'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Briefcase,
  FileText,
  Mail,
  MessageSquare,
  Reply,
  ScanSearch,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

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

const COPY: Record<string, { title: string; short: string; hint: string; href: string; button: string; icon: LucideIcon }> = {
  prospect_extracted: {
    title: 'Pull profiles',
    short: 'Pull',
    hint: 'Find people before you send.',
    href: '/prospect',
    button: 'Pull profiles',
    icon: ScanSearch,
  },
  connection_request: {
    title: 'Send connection notes',
    short: 'Notes',
    hint: 'Ask to connect. Do not pitch yet.',
    href: '/leads?filter=connect',
    button: 'Send notes',
    icon: UserPlus,
  },
  dm: {
    title: 'Send first messages',
    short: 'Messages',
    hint: 'Only after they accept.',
    href: '/leads?filter=dm',
    button: 'Send messages',
    icon: MessageSquare,
  },
  followup: {
    title: 'Follow up',
    short: 'Follow up',
    hint: 'Write again if they went quiet.',
    href: '/leads?filter=followup',
    button: 'Follow up',
    icon: Reply,
  },
  email: {
    title: 'Send emails',
    short: 'Email',
    hint: 'Email is a separate list.',
    href: '/revenue/email',
    button: 'Open email',
    icon: Mail,
  },
  application: {
    title: 'Upwork applications',
    short: 'Apply',
    hint: 'Apply to jobs that fit.',
    href: '/upwork',
    button: 'Apply',
    icon: Briefcase,
  },
  proposal: {
    title: 'Upwork proposals',
    short: 'Proposals',
    hint: 'Send the proposal after you apply.',
    href: '/upwork',
    button: 'Send proposals',
    icon: FileText,
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
      short: key.replaceAll('_', ' '),
      hint: 'Finish this number.',
      href: '/leads',
      button: 'Open',
      icon: ScanSearch,
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
  const router = useRouter()
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
  const minutes = new Date().getHours() * 60 + new Date().getMinutes()
  const fraction = !workingDay ? 0 : minutes < 9 * 60 ? 0 : minutes >= 17 * 60 ? 1 : (minutes - 9 * 60) / (8 * 60)
  const chartRows = jobs.map((job) => ({
    key: job.key,
    name: COPY[job.key]?.short ?? job.title,
    done: job.done,
    clock: Math.round(job.goal * fraction),
    goal: job.goal,
  }))
  const paceColor = pace.tone === 'won' ? 'var(--status-success)' : pace.tone === 'behind' || pace.tone === 'closed' ? 'var(--status-danger)' : 'var(--orange)'
  const hasPullJob = jobs.some((job) => job.key === 'prospect_extracted')

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'p') {
        event.preventDefault()
        router.push('/prospect')
        return
      }
      if (key === 'n' && firstOpen) {
        event.preventDefault()
        router.push(firstOpen.href)
        return
      }
      const index = Number(key) - 1
      const job = jobs[index]
      if (job && key >= '1' && key <= '9') {
        event.preventDefault()
        router.push(job.href)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jobs, firstOpen, router])

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
          <div className="relative size-[72px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[{ name: 'done', value: Math.max(unitsPct, 1) }, { name: 'left', value: Math.max(100 - unitsPct, 0) }]}
                  dataKey="value"
                  innerRadius={22}
                  outerRadius={32}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  <Cell fill={unitsPct === 0 ? 'var(--line)' : paceColor} />
                  <Cell fill="var(--line)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] font-medium text-ink">{unitsPct}%</span>
          </div>
          <div className="min-w-0">
            <p className={cn(
              'text-[15px] font-medium',
              pace.tone === 'behind' || pace.tone === 'closed' ? 'text-status-danger' : pace.tone === 'ahead' || pace.tone === 'won' ? 'text-status-success' : 'text-ink',
            )}>{pace.label}</p>
            <p className="mt-1 text-[12px] text-graphite">
              {pace.tone === 'waiting' || pace.tone === 'won' ? clock.text : `Clock expects ${pace.expected}. You have ${unitsDone}.`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant={verdict.tone === 'won' ? 'success' : verdict.tone === 'start' ? 'destructive' : verdict.tone === 'push' ? 'orange' : 'outline'}>
                {jobs.length > 0 ? `${doneJobs} of ${jobs.length} covered` : 'No numbers'}
              </Badge>
              {workingDay && <Badge variant="outline">{clock.text}</Badge>}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-stone">Shortcuts: P pull profiles · N next open job · 1–{Math.min(9, jobs.length) || 1} jump</p>
        {workingDay && clock.running && doneJobs === 0 && jobs.length > 0 && (
          <p className="mt-1 text-[13px] font-medium text-status-danger">The clock is running and nothing is sent yet.</p>
        )}
      </div>

      {jobs.length > 0 && (
        <div className="border-t border-line px-2 py-3">
          <p className="px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-stone">You vs the clock</p>
          <div style={{ height: Math.max(140, chartRows.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={78} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--ink)' }} />
                <Tooltip
                  cursor={{ fill: 'var(--bone)' }}
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as (typeof chartRows)[number] | undefined
                    if (!active || !row) return null
                    return (
                      <div className="rounded-lg border border-line bg-bone-raised px-2.5 py-1.5 text-[11px] shadow-sm">
                        <p className="font-medium text-ink">{row.name}</p>
                        <p className="text-graphite">{row.done} done · clock {row.clock} · goal {row.goal}</p>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="done" name="Done" radius={[0, 4, 4, 0]} barSize={8}>
                  {chartRows.map((row) => (
                    <Cell
                      key={row.key}
                      fill={row.done >= row.goal ? 'var(--status-success)' : row.done < row.clock ? 'var(--status-danger)' : 'var(--orange)'}
                    />
                  ))}
                </Bar>
                {workingDay && <Bar dataKey="clock" name="Clock" fill="var(--line)" radius={[0, 4, 4, 0]} barSize={8} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!hasPullJob && (
        <div className="border-t border-line px-4 py-3">
          <Link
            href="/prospect"
            className="flex items-center justify-between gap-3 rounded-md border border-line bg-bone px-3 py-3 hover:bg-bone-raised"
          >
            <span className="flex items-center gap-3">
              <ScanSearch className="size-4 text-ink" />
              <span>
                <span className="block text-[14px] font-medium text-ink">Pull profiles</span>
                <span className="text-[12px] text-graphite">{profilesPulled} pulled today. Find as many as you can.</span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-stone">P</kbd>
              <span className={buttonVariants({ size: 'sm' })}>Pull</span>
            </span>
          </Link>
        </div>
      )}

      <ol className="divide-y divide-line/70">
        {jobs.map((job, index) => {
          const covered = job.done >= job.goal
          const pct = job.goal > 0 ? Math.min(100, Math.round((job.done / job.goal) * 100)) : 0
          const isNext = firstOpen?.key === job.key
          const Icon = COPY[job.key]?.icon ?? ScanSearch
          const clockForJob = chartRows[index]?.clock ?? 0
          const behind = workingDay && !covered && job.done < clockForJob
          const hint = job.key === 'prospect_extracted' ? `${profilesPulled} pulled today. ${job.hint}` : job.hint
          return (
            <li key={job.key} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', covered ? 'bg-status-success/10 text-status-success' : behind ? 'bg-status-danger/10 text-status-danger' : 'bg-bone text-ink')}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[14px] font-medium text-ink">
                      {index + 1}. {job.title}
                    </p>
                    <Badge variant={covered ? 'success' : isNext ? 'orange' : behind ? 'destructive' : 'outline'}>
                      {covered ? 'Covered' : `${job.done}/${job.goal}`}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-graphite">{hint}</p>
                  <Progress className="mt-2" value={pct} max={100} size="md" variant={covered ? 'success' : behind ? 'danger' : 'default'} />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {!covered && workingDay ? (
                      <Link href={job.href} className={buttonVariants({ variant: 'orange', size: 'xs' })}>
                        {job.button} · {job.goal - job.done} left
                      </Link>
                    ) : (
                      <p className="text-[12px] font-medium text-status-success">{covered ? 'Covered' : 'Paused'}</p>
                    )}
                    <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-stone">{index + 1}</kbd>
                  </div>
                </div>
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
          <Link href={firstOpen.href} className={buttonVariants({ variant: 'orange', size: 'sm' })}>
            {firstOpen.button}
          </Link>
        </div>
      </div>
    )}
    </>
  )
}
