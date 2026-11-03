/**
 * Phase 4–6 stabilization gates: role-aware navigation, Lead 360 authorization,
 * canonical pipeline-stage vocabulary, proxy coverage.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { canOpenLead, type OperationalScope } from '@/lib/operations/scope'
import {
  CONVERSATION_STAGE_GROUPS,
  MEETING_AND_WON_STAGES,
  MEETING_OR_LATER_STAGES,
  PROPOSAL_OR_LATER_STAGES,
  REPLY_STAGES,
  conversationStageGroup,
} from '@/lib/sales/stage-vocabulary'
import { PIPELINE_STAGE_GROUPS, pipelineGroupForStage } from '@/lib/operations/reports'

const orgId = 'org-1'

function scope(mode: OperationalScope['mode'], repIds: string[] | null): OperationalScope {
  return { mode, orgId, actorRepId: 'rep-1', repIds }
}

const lead = (ownerRepId: string | null, organizationId = orgId) => ({ organizationId, ownerRepId })

describe('LEAD_360_ROLE_SCOPE', () => {
  it('a rep may open their own leads', () => {
    expect(canOpenLead({ orgId }, scope('own', ['rep-1']), lead('rep-1'))).toBe(true)
  })

  it('a rep may open an unassigned lead', () => {
    expect(canOpenLead({ orgId }, scope('own', ['rep-1']), lead(null))).toBe(true)
  })

  it('a rep may not open another rep\'s lead', () => {
    expect(canOpenLead({ orgId }, scope('own', ['rep-1']), lead('rep-2'))).toBe(false)
  })
})

describe('LEAD_360_MANAGER_SCOPE', () => {
  it('a manager may open their own lead', () => {
    expect(canOpenLead({ orgId }, scope('team', ['mgr', 'rep-a']), lead('mgr'))).toBe(true)
  })

  it('a manager may open a managed team member\'s lead', () => {
    expect(canOpenLead({ orgId }, scope('team', ['mgr', 'rep-a']), lead('rep-a'))).toBe(true)
  })

  it('a manager may open an unassigned lead', () => {
    expect(canOpenLead({ orgId }, scope('team', ['mgr', 'rep-a']), lead(null))).toBe(true)
  })

  it('a manager may not open a lead outside the managed team', () => {
    expect(canOpenLead({ orgId }, scope('team', ['mgr', 'rep-a']), lead('rep-z'))).toBe(false)
  })
})

describe('LEAD_360_CROSS_ORG_DENIED', () => {
  it('denies a lead from another organization for every role', () => {
    for (const s of [scope('own', ['rep-1']), scope('team', ['mgr']), scope('org', null)]) {
      expect(canOpenLead({ orgId }, s, lead('rep-1', 'org-2'))).toBe(false)
    }
  })

  it('an admin still opens any lead inside their own organization', () => {
    expect(canOpenLead({ orgId }, scope('org', null), lead('rep-any'))).toBe(true)
  })
})

describe('REPORT_PIPELINE_CANONICAL_STAGE_PARITY', () => {
  it('reports imports the shared vocabulary instead of declaring its own', () => {
    expect(PIPELINE_STAGE_GROUPS).toBe(CONVERSATION_STAGE_GROUPS)
    expect(pipelineGroupForStage).toBeDefined()
  })

  it('the funnel covers the representative stages', () => {
    const labels = CONVERSATION_STAGE_GROUPS.map((g) => g.label)
    for (const label of ['Qualified', 'Contacted', 'Conversation', 'Meeting', 'Proposal', 'Won']) {
      expect(labels, label).toContain(label)
    }
  })

  it('every raw conversation stage maps to exactly one group', () => {
    for (const group of CONVERSATION_STAGE_GROUPS) {
      for (const stage of group.stages ?? []) {
        const matched = CONVERSATION_STAGE_GROUPS.filter((g) => g.stages?.includes(stage))
        expect(matched.map((m) => m.key), stage).toEqual([group.key])
      }
    }
  })

  it('every stage used by the other surfaces resolves to a group', () => {
    for (const stage of [
      ...MEETING_AND_WON_STAGES,
      ...MEETING_OR_LATER_STAGES,
      ...PROPOSAL_OR_LATER_STAGES,
      ...REPLY_STAGES,
    ]) {
      expect(conversationStageGroup(stage), stage).not.toBeNull()
      expect(pipelineGroupForStage(stage), stage).toBe(conversationStageGroup(stage))
    }
  })

  it('terminal stages are not pipeline stages', () => {
    expect(conversationStageGroup('lost')).toBeNull()
    expect(conversationStageGroup('dead')).toBeNull()
    expect(conversationStageGroup('no')).toBeNull()
  })
})

describe('APP_ROUTE_PROXY_COVERAGE', () => {
  const proxy = readFileSync('src/proxy.ts', 'utf8')
  const block = proxy.match(/PROTECTED_PREFIXES\s*=\s*\[([\s\S]*?)\]/)![1]
  const prefixes = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1])

  function appSegments(dir: string, prefix = ''): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (!statSync(full).isDirectory()) continue
      if (entry === 'api') continue
      const segment = `${prefix}/${entry}`
      if (entry.startsWith('[')) {
        out.push(prefix || '/')
        continue
      }
      out.push(segment)
      out.push(...appSegments(full, segment))
    }
    return out
  }

  it('covers every (app) route prefix', () => {
    const segments = new Set(appSegments('src/app/(app)'))
    const uncovered = [...segments].filter(
      (seg) => seg !== '/' && !prefixes.some((p) => seg === p || seg.startsWith(`${p}/`)),
    )
    expect(uncovered).toEqual([])
  })

  it('never lists a public route as protected', () => {
    for (const publicRoute of ['/login', '/signup', '/pricing', '/docs']) {
      expect(prefixes).not.toContain(publicRoute)
    }
  })
})
