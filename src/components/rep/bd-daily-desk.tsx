'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Clock,
  MessageSquare,
  Search,
  Sparkles,
  UserPlus,
  Users,
  Briefcase,
  Handshake,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from 'cn'
import type { RelayTodayAction } from '@/components/relay-today-workspace'

interface BdDailyDeskProps {
  yourMove: RelayTodayAction[]
  theirMove: RelayTodayAction[]
  repliesWaiting: number
  followUpsDue: number
  referredLeads: Array<{ id: string; company: string; score: number | null; canonicalScore: number | null; referredAt: string | null }>
  recentLeads: Array<{ id: string; company: string; score: number | null; canonicalScore: number | null; createdAt: string }>
}

export function BdDailyDesk({
  yourMove,
  theirMove,
  repliesWaiting,
  followUpsDue,
  referredLeads,
  recentLeads,
}: BdDailyDeskProps) {
  const [quickPasted, setQuickPasted] = useState('')

  const handleQuickAnalyze = () => {
    if (quickPasted.trim().length < 24) return
    window.location.href = `/prospect?paste=${encodeURIComponent(quickPasted)}`
  }

  return (
    <div className="space-y-5">
      {/* Quick Analyze — prominent paste input */}
      <section className="rounded-lg border border-line bg-bone-raised p-4">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-orange" />
          <h2 className="text-sm font-medium text-ink">Analyze a prospect</h2>
        </div>
        <p className="mt-1 text-xs text-graphite">
          Paste a LinkedIn profile, Upwork job, or conversation. Relay identifies the source and starts the right flow.
        </p>
        <Textarea
          value={quickPasted}
          onChange={(e) => setQuickPasted(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              handleQuickAnalyze()
            }
          }}
          placeholder="Paste a prospect, job, profile or conversation..."
          rows={5}
          className="mt-3 max-h-[16rem] overflow-y-auto font-mono text-[13px]"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-graphite">Cmd / Ctrl + Enter</span>
          <Button
            variant="orange"
            size="sm"
            onClick={handleQuickAnalyze}
            disabled={quickPasted.trim().length < 24}
          >
            <Sparkles className="size-3.5" />
            Analyze
          </Button>
        </div>
      </section>

      {/* Primary actions row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link
          href="/prospect"
          className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-bone-raised p-3 transition-colors hover:border-orange/40 hover:bg-orange/[0.03]"
        >
          <UserPlus className="size-5 text-orange" />
          <span className="text-[11px] font-medium text-ink">Extract Profile</span>
        </Link>
        <Link
          href="/leads?filter=followup"
          className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-bone-raised p-3 transition-colors hover:border-orange/40 hover:bg-orange/[0.03]"
        >
          <MessageSquare className="size-5 text-orange" />
          <span className="text-[11px] font-medium text-ink">Follow-ups</span>
          {followUpsDue > 0 && (
            <span className="text-[10px] font-medium text-status-warning">{followUpsDue} due</span>
          )}
        </Link>
        <Link
          href="/leads?filter=reply"
          className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-bone-raised p-3 transition-colors hover:border-orange/40 hover:bg-orange/[0.03]"
        >
          <Handshake className="size-5 text-orange" />
          <span className="text-[11px] font-medium text-ink">Replies</span>
          {repliesWaiting > 0 && (
            <span className="text-[10px] font-medium text-status-warning">{repliesWaiting} waiting</span>
          )}
        </Link>
          <Link
            href="/leads?filter=referred"
            className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-bone-raised p-3 transition-colors hover:border-orange/40 hover:bg-orange/[0.03]"
          >
            <Users className="size-5 text-orange" />
            <span className="text-[11px] font-medium text-ink">Referred to you</span>
            {referredLeads.length > 0 && (
              <span className="text-[10px] font-medium text-status-warning">{referredLeads.length} new</span>
            )}
          </Link>
      </div>

      {/* YOUR MOVE queue */}
      {yourMove.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-3.5 text-orange" />
            <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Your move</h3>
          </div>
          <div className="space-y-1.5">
            {yourMove.slice(0, 5).map((action) => (
              <Link
                key={action.id}
                href={action.href}
                className="flex items-center gap-3 rounded-lg border border-line bg-bone-raised p-3 transition-colors hover:border-orange/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">{action.title}</span>
                    {action.priority === 'urgent' && (
                      <span className="rounded-full bg-status-danger/10 px-1.5 py-0.5 text-[9px] font-medium text-status-danger">
                        URGENT
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-graphite">{action.whatHappened}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-stone" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* THEIR MOVE queue */}
      {theirMove.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-stone" />
            <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Their move</h3>
          </div>
          <div className="space-y-1.5">
            {theirMove.slice(0, 3).map((action) => (
              <div
                key={action.id}
                className="flex items-center gap-3 rounded-lg border border-line/60 bg-bone-raised/60 p-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-[12px] text-ink">{action.title}</span>
                  <p className="mt-0.5 truncate text-[11px] text-graphite">{action.subtitle}</p>
                </div>
                <span className="shrink-0 text-[10px] text-stone">Waiting</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent work */}
      {recentLeads.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Recent work</h3>
          <div className="space-y-1">
            {recentLeads.slice(0, 4).map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="flex items-center justify-between rounded-lg border border-line/60 bg-bone-raised/40 px-3 py-2 transition-colors hover:bg-bone"
              >
                <span className="text-[12px] text-ink">{lead.company}</span>
                {lead.canonicalScore != null ? (
                  <span className="text-[11px] font-mono text-stone">{Math.round(lead.canonicalScore / 10)}/10</span>
                ) : lead.score != null ? (
                  <span className="text-[11px] font-mono text-stone">{lead.score}/12</span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
