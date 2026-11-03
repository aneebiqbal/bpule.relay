# Relay V3 — Inbox / Conversation Workspace

Sprint 3. One canonical communication product: `/chats`, labelled **Inbox**.

## Information architecture

| Surface | Status |
|---|---|
| `/chats` | **Canonical Inbox.** Queue + thread + context. |
| `/inbound` | Redirects into the Inbox queue (same domain). |
| `/relay` | Rep queue → deep-links into `/chats?lead=<id>`. |
| Lead 360 conversation tab | Opens the same canonical thread; "Open in Inbox" links to `/chats?lead=<id>`. |
| Notifications | Deep-link to `/chats?lead=<id>` for inbound reply / meeting request / proposal request. |
| Home reply metric | Links to `/chats`. |

There is no second conversation engine. The Inbox is a presentation and workflow
layer over `messages`, `conversation_states`, `deriveConversationRow`,
`deriveNextLeadAction` and the follow-up policy.

## Queue

Views (URL `?view=`):

```
Needs reply · Waiting · Follow-ups · Meeting requests · Proposal requests · Closed
```

Manager/Admin additionally: `Waiting >4h`, `Waiting >12h`, `Unassigned`, `Thread review`.

- **Needs reply** — latest meaningful client message with no later meaningful
  outbound. Derived by `deriveConversationRow`, never by `direction === 'inbound'` alone.
- **Waiting** — the rep moved; the client has not.
- **Follow-ups** — the canonical follow-up clock (`nextFollowupAt`), so a lead
  that has never been sent anything can never appear here (BUG-26).
- **Meeting / Proposal requests** — canonical analysed intent only
  (`memory->lastClientAnalysis->>intent`), never keyword matching on message text.
- **Closed** — terminal lifecycle or won/lost state.

Sort contract: **priority band first (critical → low), then oldest wait within
the band.** Priority is derived from waiting state, age, and canonical intent —
not a new hidden score.

Row projection is bounded: lead id, person, company, profile, owner, a 140-char
preview of the latest message, waiting state, age, priority and next action.
Full threads and full score payloads are never read for the queue.

## Thread

`LeadConversation` renders the canonical message timeline — one opening message,
no duplicates, correct direction, profile and timestamps. Timestamps go through
the central normaliser, so `Date`, numbers, ISO strings, `null`, `undefined` and
invalid values cannot crash rendering.

Internal notes render in their own dashed surface, labelled
`Internal · not visible to the client`, and are never inserted into the client
timeline. When the notes capability is genuinely unavailable the panel says
`Internal notes unavailable` — never database or migration language.

## Context

`ChatIntelligencePanel` shows a bounded per-lead summary: opportunity score,
buyer intent, stage, waiting state, owner, sending profile, last activity, next
action, sales thesis, missing evidence and open tasks. Raw
`score_breakdown` / `canonicalIntelligence` JSON and provider metadata are never
rendered.

## Responsive

| Breakpoint | Layout |
|---|---|
| ≥1280 | queue + thread + context |
| 768–1279 | queue + thread, context in a drawer |
| <768 | queue → thread → context drawer |

## Error isolation

| Failure | Behaviour |
|---|---|
| Queue | queue pane shows a retry message; thread pane stays usable |
| Thread | thread pane shows a message; queue stays usable |
| Context | context pane shows a message; thread stays usable |
| Notes | notes panel shows a message; conversation stays usable |

## Performance / egress

Initial queue reads scalar columns plus one bounded preview row per visible
conversation. The thread and context load only for the selected lead. The queue
is capped at 1,500 leads and the visible page at 60–200 rows.

## Fixtures

`src/lib/operations/inbox-fixtures.ts` holds eleven realistic conversations
covering every queue view and waiting state. `/inbox-fixture?role=rep|manager|admin`
renders the real queue, a synthetic thread and the real context panel with that
data — the deterministic visual-QA surface used while Neon Auth is unavailable.

## Tests

`tests/v3/inbox-v3.test.ts` — named contracts for every queue view, scope,
parity, error-isolation and mobile rule in the sprint matrix.
