
export type SignalTone = 'bone' | 'orange' | 'cobalt'

export interface FieldSignal {
  id: string
  label: string | null
  source: string
  time: string
  /** scatter position, % of field */
  home: { x: number; y: number }
  /** converged position, % of field */
  target: { x: number; y: number }
  tone: SignalTone
  featured?: boolean
  /** hidden on mobile via CSS — density control without JS */
  minor?: boolean
}

/* ── Hero field ───────────────────────────────────────────────
 * 18 nodes. Three contexts: Sarah (hot conversation), Pipeline
 * (opportunities), Studio (demand creation). The featured node
 * converges above the Do-This-Next card. Minor nodes are hidden
 * on mobile via CSS.
 * ──────────────────────────────────────────────────────────── */
export const HERO_SIGNALS: FieldSignal[] = [
  // Sarah cluster — converges around the card
  { id: 'sarah-reply', label: 'Sarah replied', source: 'LinkedIn', time: '2m', home: { x: 44, y: 16 }, target: { x: 50, y: 12 }, tone: 'orange', featured: true },
  { id: 'sarah-proof', label: 'Proof requested', source: 'Scale.io', time: '1d', home: { x: 66, y: 10 }, target: { x: 37, y: 30 }, tone: 'bone' },
  { id: 'sarah-inbound', label: 'Inbound message', source: 'Email', time: '30m', home: { x: 34, y: 32 }, target: { x: 66, y: 31 }, tone: 'bone' },
  { id: 'sarah-followup', label: 'Follow-up due', source: 'Acme Corp', time: '5d', home: { x: 58, y: 36 }, target: { x: 39, y: 58 }, tone: 'bone' },
  { id: 'sarah-view', label: 'Post viewed', source: 'Studio', time: '2h', home: { x: 48, y: 54 }, target: { x: 64, y: 59 }, tone: 'bone', minor: true },
  { id: 'd1', label: null, source: '', time: '', home: { x: 28, y: 14 }, target: { x: 45, y: 31 }, tone: 'bone', minor: true },
  { id: 'd2', label: null, source: '', time: '', home: { x: 70, y: 24 }, target: { x: 58, y: 31 }, tone: 'bone', minor: true },
  { id: 'd5', label: null, source: '', time: '', home: { x: 40, y: 72 }, target: { x: 44, y: 57 }, tone: 'bone', minor: true },

  // Pipeline cluster — upper right
  { id: 'pipe-prospect', label: 'New prospect', source: 'Upwork', time: '1h', home: { x: 86, y: 34 }, target: { x: 79, y: 57 }, tone: 'bone' },
  { id: 'pipe-job', label: 'Job matched', source: 'LinkedIn', time: '3h', home: { x: 92, y: 52 }, target: { x: 88, y: 63 }, tone: 'bone' },
  { id: 'pipe-connection', label: 'Connection accepted', source: 'DevCore', time: '4h', home: { x: 72, y: 48 }, target: { x: 73, y: 68 }, tone: 'bone', minor: true },
  { id: 'pipe-proposal', label: 'Proposal waiting', source: 'TechVista', time: '2d', home: { x: 88, y: 74 }, target: { x: 83, y: 75 }, tone: 'bone' },
  { id: 'd4', label: null, source: '', time: '', home: { x: 78, y: 88 }, target: { x: 77, y: 71 }, tone: 'bone', minor: true },
  { id: 'd6', label: null, source: '', time: '', home: { x: 60, y: 82 }, target: { x: 90, y: 71 }, tone: 'bone', minor: true },

  // Studio cluster — lower left
  { id: 'studio-idea', label: 'Idea ready', source: 'Studio', time: '2d', home: { x: 10, y: 40 }, target: { x: 11, y: 57 }, tone: 'cobalt' },
  { id: 'studio-published', label: 'Post published', source: 'Studio', time: '1d', home: { x: 6, y: 60 }, target: { x: 7, y: 67 }, tone: 'cobalt' },
  { id: 'studio-attention', label: 'Attention spike', source: 'Studio', time: '4h', home: { x: 24, y: 78 }, target: { x: 17, y: 76 }, tone: 'cobalt' },
  { id: 'd3', label: null, source: '', time: '', home: { x: 14, y: 22 }, target: { x: 13, y: 65 }, tone: 'bone', minor: true },
]

/* ── Context section — the signal ledger ─────────────────── */
export interface ContextSignal {
  id: string
  label: string
  source: string
  time: string
  tone: SignalTone
  /** id of the console row this signal links to */
  linksTo: string[]
}

export const CONTEXT_SIGNALS: ContextSignal[] = [
  { id: 'sarah-reply', label: 'Sarah replied', source: 'LinkedIn', time: '2m ago', tone: 'orange', linksTo: ['action-sarah', 'queue-01', 'conv-sarah'] },
  { id: 'sarah-inbound', label: 'Inbound message', source: 'Email', time: '30m ago', tone: 'orange', linksTo: ['queue-01'] },
  { id: 'pipe-prospect', label: 'New prospect', source: 'Upwork', time: '1h ago', tone: 'bone', linksTo: ['queue-02'] },
  { id: 'pipe-job', label: 'Job matched', source: 'LinkedIn', time: '3h ago', tone: 'bone', linksTo: ['queue-04'] },
  { id: 'pipe-connection', label: 'Connection accepted', source: 'DevCore', time: '4h ago', tone: 'bone', linksTo: ['conv-marcus'] },
  { id: 'studio-attention', label: 'Attention spike', source: 'Studio', time: '4h ago', tone: 'cobalt', linksTo: ['queue-05'] },
  { id: 'sarah-proof', label: 'Proof requested', source: 'Scale.io', time: '1d ago', tone: 'bone', linksTo: ['queue-03'] },
  { id: 'pipe-proposal', label: 'Proposal waiting', source: 'TechVista', time: '2d ago', tone: 'bone', linksTo: ['queue-06'] },
]

/* ── Today console (Context section, reconstructed product UI) ── */
export const TODAY_QUEUE = [
  { id: 'queue-01', kind: 'Reply', who: 'Sarah Chen', why: 'Asked for relevant proof', stage: 'NOW' },
  { id: 'queue-02', kind: 'Review', who: 'New prospect · Upwork', why: 'Strong profile match', stage: 'NEXT' },
  { id: 'queue-03', kind: 'Proof', who: 'Scale.io', why: 'Evidence requested', stage: 'TODAY' },
  { id: 'queue-04', kind: 'Match', who: 'DevCore job', why: 'Fits your last three engagements', stage: 'TODAY' },
  { id: 'queue-05', kind: 'Write', who: 'Studio opportunity', why: 'Attention spike on your latest post', stage: 'TODAY' },
  { id: 'queue-06', kind: 'Follow-up', who: 'TechVista', why: 'Proposal waiting · 2 days', stage: 'LATER' },
]

export const TODAY_CONVERSATIONS = [
  { id: 'conv-sarah', name: 'Sarah Chen', signal: 'Replied 2m ago — asking for proof', next: 'Reply' },
  { id: 'conv-marcus', name: 'Marcus Webb', signal: 'DM sent 1d ago', next: 'Waiting' },
]

/* ── Priority section — labeled chips, one dominates ──────── */
export const PRIORITY_SIGNALS: FieldSignal[] = [
  { id: 'p-sarah', label: 'Sarah replied', source: 'LinkedIn', time: '2m', home: { x: 44, y: 18 }, target: { x: 19, y: 42 }, tone: 'orange', featured: true },
  { id: 'p-followup', label: 'Follow-up due', source: 'TechVista', time: '5d', home: { x: 72, y: 14 }, target: { x: 58, y: 16 }, tone: 'bone' },
  { id: 'p-prospect', label: 'New prospect', source: 'Upwork', time: '1h', home: { x: 16, y: 28 }, target: { x: 10, y: 22 }, tone: 'bone', minor: true },
  { id: 'p-job', label: 'Job matched', source: 'LinkedIn', time: '3h', home: { x: 86, y: 34 }, target: { x: 82, y: 28 }, tone: 'bone' },
  { id: 'p-inbound', label: 'Inbound message', source: 'Email', time: '30m', home: { x: 30, y: 56 }, target: { x: 14, y: 58 }, tone: 'bone' },
  { id: 'p-proposal', label: 'Proposal waiting', source: 'Scale.io', time: '2d', home: { x: 58, y: 64 }, target: { x: 46, y: 74 }, tone: 'bone' },
  { id: 'p-connection', label: 'Connection accepted', source: 'DevCore', time: '4h', home: { x: 12, y: 78 }, target: { x: 8, y: 80 }, tone: 'bone', minor: true },
  { id: 'p-proof', label: 'Proof requested', source: 'Scale.io', time: '1d', home: { x: 78, y: 80 }, target: { x: 74, y: 82 }, tone: 'bone' },
  { id: 'p-published', label: 'Post published', source: 'Studio', time: '1d', home: { x: 48, y: 88 }, target: { x: 36, y: 88 }, tone: 'cobalt', minor: true },
  { id: 'p-attention', label: 'Attention spike', source: 'Studio', time: '4h', home: { x: 90, y: 58 }, target: { x: 90, y: 54 }, tone: 'cobalt' },
  { id: 'p-idea', label: 'Idea ready', source: 'Studio', time: '2d', home: { x: 6, y: 46 }, target: { x: 10, y: 40 }, tone: 'bone', minor: true },
  { id: 'p-dm', label: 'DM sent', source: 'Marcus', time: '1d', home: { x: 64, y: 40 }, target: { x: 66, y: 44 }, tone: 'bone' },
]

/* ── Move section — ownership states ──────────────────────── */
export interface MoveItem {
  id: string
  who: string
  signal: string
  action: string
  stack: 'yours' | 'theirs'
  note?: string
}

export const MOVE_ITEMS: MoveItem[] = [
  { id: 'mv-sarah', who: 'Sarah Chen', signal: 'Replied 2m ago', action: 'Reply', stack: 'yours' },
  { id: 'mv-followup', who: 'TechVista', signal: 'Follow-up due · 5 days', action: 'Send follow-up', stack: 'yours' },
  { id: 'mv-marcus', who: 'Marcus Webb', signal: 'DM sent · 1 day ago', action: 'Wait', stack: 'theirs', note: 'Do not DM again' },
  { id: 'mv-devcore', who: 'DevCore', signal: 'Connection pending', action: 'Wait', stack: 'theirs', note: 'Do not DM' },
  { id: 'mv-scale', who: 'Scale.io', signal: 'Proposal sent · 2 days ago', action: 'Wait', stack: 'theirs' },
]

/* ── Conversation section — the Sarah thread ──────────────── */
export const CONVERSATION_STEPS = [
  {
    id: 'cv-inbound',
    type: 'inbound' as const,
    who: 'Sarah Chen',
    time: '11:42 AM',
    text: 'This sounds useful. How do you normally structure engagements like this?',
  },
  {
    id: 'cv-insight',
    type: 'relay' as const,
    text: 'Sarah is asking about process, not price. Keep it commercial — one point of accountability, not technical detail.',
  },
  {
    id: 'cv-draft',
    type: 'draft' as const,
    goal: 'Move toward a call',
    text: 'We usually take ownership of a defined software outcome rather than adding another team for you to manage. That means one point of accountability from kickoff to delivery. Happy to walk through what that looked like for a team your size.',
  },
]

export const REFINEMENT_CHIPS = ['Shorter', 'More formal', 'Add proof']

/* ── Studio → Relay handoff ───────────────────────────────── */
export const STUDIO_IDEA = {
  label: 'Studio · Ideas',
  title: 'How we take ownership of outcomes',
  angle: 'From your recent delivery win · matches your positioning',
  status: 'Ready to write',
  published: 'Published to LinkedIn · Tuesday',
  attention: 'Sarah Chen viewed your post · 2h ago',
}

export const RELAY_CAPTURE = [
  { id: 'rc-prospect', kind: 'Signal', text: 'New prospect · Sarah Chen', sub: 'From: Studio post · VP Engineering · Acme' },
  { id: 'rc-conversation', kind: 'Conversation', text: 'Sarah replied', sub: '“This sounds useful. How do you normally…”' },
  { id: 'rc-action', kind: 'Do This Next', text: 'Reply to Sarah', sub: 'Draft prepared in your voice' },
]

export const STUDIO_PIPELINE = ['Idea', 'Insight', 'Content', 'Publish']
export const RELAY_PIPELINE = ['Signal', 'Prospect', 'Conversation', 'Action']
