/**
 * Marketing demo data — isolated from production application state.
 * All content here is for the marketing site only.
 */

export interface DemoSignal {
  id: string
  label: string
  source: string
  time: string
  tone: 'orange' | 'cobalt' | 'ink'
}

export interface DemoLead {
  id: string
  name: string
  role: string
  company: string
  signal: string
  source: string
  relationship: string
  nextAction: string
  objective: string
}

export interface DemoMessage {
  id: string
  sender: 'client' | 'relay' | 'us'
  text: string
  timestamp: string
  type?: 'message' | 'insight' | 'draft' | 'goal'
}

export interface DemoTeamMember {
  id: string
  name: string
  role: string
  actionsRemaining: number
  status: 'active' | 'waiting' | 'complete'
  lastActivity: string
}

export const DEMO_SIGNALS: DemoSignal[] = [
  { id: 's1', label: 'Sarah replied', source: 'LinkedIn', time: '2m ago', tone: 'orange' },
  { id: 's2', label: 'Follow-up due', source: 'Acme Corp', time: '5d', tone: 'orange' },
  { id: 's3', label: 'New prospect', source: 'Upwork', time: '1h ago', tone: 'ink' },
  { id: 's4', label: 'Job matched', source: 'LinkedIn', time: '3h ago', tone: 'ink' },
  { id: 's5', label: 'Proposal waiting', source: 'TechVista', time: '2d', tone: 'cobalt' },
  { id: 's6', label: 'Connection accepted', source: 'DevCore', time: '4h ago', tone: 'ink' },
  { id: 's7', label: 'Inbound message', source: 'Email', time: '30m ago', tone: 'orange' },
  { id: 's8', label: 'Proof requested', source: 'Scale.io', time: '1d', tone: 'cobalt' },
]

export const DEMO_LEAD: DemoLead = {
  id: 'lead-demo',
  name: 'Sarah Chen',
  role: 'VP Engineering',
  company: 'Acme Corp',
  signal: 'Asked for relevant proof',
  source: 'LinkedIn · Today',
  relationship: 'Potential buyer',
  nextAction: 'Prepare Reply',
  objective: 'Answer their proof question and move toward a call',
}

export const DEMO_CONVERSATION: DemoMessage[] = [
  {
    id: 'c1',
    sender: 'client',
    text: 'This sounds useful. How do you normally structure engagements like this?',
    timestamp: '11:42 AM',
    type: 'message',
  },
  {
    id: 'c2',
    sender: 'relay',
    text: "They're interested and asking about how you work. Keep this commercial, not technical.",
    timestamp: '11:42 AM',
    type: 'insight',
  },
  {
    id: 'c3',
    sender: 'relay',
    text: 'Answer clearly and move toward a call.',
    timestamp: '',
    type: 'goal',
  },
  {
    id: 'c4',
    sender: 'us',
    text: "We usually take ownership of a defined software outcome rather than adding another team for you to manage. That means one point of accountability from kickoff to delivery.",
    timestamp: '',
    type: 'draft',
  },
]

export const DEMO_TEAM: DemoTeamMember[] = [
  { id: 't1', name: 'Ahmad', role: 'BD Lead', actionsRemaining: 5, status: 'active', lastActivity: 'Replied to Sarah · 2m' },
  { id: 't2', name: 'Hassan', role: 'Outreach', actionsRemaining: 2, status: 'waiting', lastActivity: 'DM sent · 1d' },
  { id: 't3', name: 'Dawood', role: 'Conversations', actionsRemaining: 0, status: 'complete', lastActivity: 'All caught up' },
]

export const DEMO_STAGES = [
  { id: 'discover', label: 'Discover' },
  { id: 'connect', label: 'Connect' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'outcome', label: 'Outcome' },
] as const

export const DEMO_LOOP_STAGES = [
  { id: 'signal', label: 'Signal', color: 'var(--stone)' },
  { id: 'understand', label: 'Understand', color: 'var(--ink-700)' },
  { id: 'prioritize', label: 'Prioritize', color: 'var(--orange-signal)' },
  { id: 'act', label: 'Act', color: 'var(--orange-signal)' },
  { id: 'outcome', label: 'Outcome', color: 'var(--ink-700)' },
  { id: 'learn', label: 'Learn', color: 'var(--cobalt-signal)' },
] as const

export const DEMO_CAPABILITIES = [
  { label: 'Revenue Intelligence', description: 'Understand which opportunities deserve attention.' },
  { label: 'Conversations', description: 'Stay with every relationship, from first message to close.' },
  { label: 'Jobs', description: 'Match and apply to the right opportunities.' },
  { label: 'Studio', description: 'Create demand with calibrated content.' },
  { label: 'Team Operations', description: 'Everyone knows what needs attention.' },
  { label: 'Proof', description: 'Connect claims to verified evidence.' },
] as const
