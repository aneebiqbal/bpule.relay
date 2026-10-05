'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageSquare, Check, Send, PenLine, Loader2 } from 'lucide-react'
import { cn } from 'cn'
import type { LeadRow, PipelineStage } from './pipeline-utils'

interface PipelineQuickActionsProps {
  lead: LeadRow
  stage: PipelineStage
}

export function PipelineQuickActions({ lead, stage }: PipelineQuickActionsProps) {
  const [acting, setActing] = useState<string | null>(null)

  async function handleAction(action: string, endpoint: string, method: string = 'POST') {
    setActing(action)
    try {
      const res = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.error('Action failed:', data.error)
      }
      window.location.reload()
    } catch (err) {
      console.error('Action error:', err)
      setActing(null)
    }
  }

  const actions = getActionsForStage(stage, lead)

  if (actions.length === 0) return null

  return (
    <div className="border-t border-line/40 px-3 py-2">
      <div className="flex items-center gap-1.5">
        {actions.map((action) => {
          if (action.href) {
            return (
              <Link
                key={action.id}
                href={action.href}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  action.variant === 'primary'
                    ? 'bg-orange/10 text-orange hover:bg-orange/20'
                    : 'text-graphite hover:bg-bone-raised hover:text-ink',
                )}
              >
                {action.icon}
                {action.label}
              </Link>
            )
          }

          const isLoading = acting === action.id
          return (
            <button
              key={action.id}
              type="button"
              disabled={isLoading}
              onClick={() => handleAction(action.id!, action.endpoint!, action.method)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                action.variant === 'primary'
                  ? 'bg-orange/10 text-orange hover:bg-orange/20'
                  : 'text-graphite hover:bg-bone-raised hover:text-ink',
                isLoading && 'opacity-60 cursor-wait',
              )}
            >
              {isLoading ? <Loader2 className="size-3 animate-spin" /> : action.icon}
              {action.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface QuickAction {
  id?: string
  label: string
  icon: React.ReactNode
  variant?: 'primary' | 'secondary'
  href?: string
  endpoint?: string
  method?: string
}

function getActionsForStage(stage: PipelineStage, lead: LeadRow): QuickAction[] {
  const viewLead: QuickAction = {
    label: 'Open',
    icon: <PenLine className="size-3" />,
    href: `/leads/${lead.id}`,
  }

  switch (stage) {
    case 'new':
      return [
        { id: 'gen-connection', label: 'Connection', icon: <MessageSquare className="size-3" />, variant: 'primary', endpoint: `/api/leads/${lead.id}/draft?type=connection` },
        viewLead,
      ]

    case 'connection_pending':
      return [
        { id: 'mark-accepted', label: 'Accepted', icon: <Check className="size-3" />, variant: 'primary', endpoint: `/api/leads/${lead.id}/connection-accepted` },
        viewLead,
      ]

    case 'message_draft':
      return [
        { id: 'gen-dm', label: 'Generate DM', icon: <Send className="size-3" />, variant: 'primary', endpoint: `/api/leads/${lead.id}/draft?type=dm` },
        viewLead,
      ]

    case 'waiting_for_reply':
      return [
        { id: 'paste-reply', label: 'Log Reply', icon: <MessageSquare className="size-3" />, variant: 'primary', href: `/leads/${lead.id}` },
        viewLead,
      ]

    case 'they_replied':
      return [
        { id: 'gen-reply', label: 'Reply', icon: <Send className="size-3" />, variant: 'primary', href: `/leads/${lead.id}` },
        viewLead,
      ]

    case 'followup_due':
      return [
        { id: 'gen-followup', label: 'Follow Up', icon: <Send className="size-3" />, variant: 'primary', endpoint: `/api/leads/${lead.id}/draft?type=followup` },
        viewLead,
      ]

    case 'in_conversation':
      return [
        { id: 'continue', label: 'Continue', icon: <MessageSquare className="size-3" />, variant: 'primary', href: `/leads/${lead.id}` },
        viewLead,
      ]

    case 'won':
    case 'closed':
      return [viewLead]

    default:
      return [viewLead]
  }
}
