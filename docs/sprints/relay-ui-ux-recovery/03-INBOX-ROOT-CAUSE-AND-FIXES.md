# Inbox — root cause and fixes

## Root cause

`/chats` was never missing; it exists at `src/app/(app)/chats/page.tsx` with a deterministic
fixture at `/inbox-fixture`. The failure was an **authority mismatch between three layers**.

```
queue (loadChatQueue)      authority = operational scope rep ids
                            + executable/covered identities
conversation API           store.getLead(id)  → owner-only gate unless reps.role='admin'
intelligence pane          loadChatIntelligence → repInScope(owner) only
```

`repRoleFor()` (`src/lib/auth/invitations.ts`) maps `OWNER`/`ADMIN` → `'admin'` and
`MANAGER`/`MEMBER` → `'rep'`. So:

- A **manager** opening `/chats`: desktop auto-select navigates to the first queue row,
  `GET /api/leads/[id]/conversation` calls `loadConversation(store,id)` → `getLead(id)`
  unscoped → `throw 'You are not the owner of this lead.'` → HTTP 500 → the thread pane shows
  **"Could not load the conversation."** while the queue, header and intelligence render.
  That is the manager Inbox being unusable.
- A **covering rep**: the queue deliberately includes covered-profile leads
  (`chat-queue.ts` `.or(owner_rep_id.in.(repIds), revenue_identity_id.in.(covered))`), but
  `loadChatIntelligence` rejected them, so the context pane reported
  "Lead context could not be loaded." for a row the Inbox itself surfaced.
- A **manager who chose `scope=me`**: the URL lost `scope`, so every navigation silently
  widened the queue back to the whole team.

## Data flow after the fix

```
/chats (server)
 ├─ requireOpsContext → resolveOperationalScope + getAuthorizedIdentities
 ├─ repIds      = personalScope ? [self] : effectiveRepIds(scope, {rep, team})
 ├─ queue       = loadChatQueue(... repIds, executableIdentities, coveredIdentityIds)
 └─ getIntelligence(leadId, repIds, authorizedIdentityIds)   [failure-isolated]
      └─ canOpenConversationLead({repIds}, owner, identity, authorizedIdentityIds)

/api/leads/[id]/conversation[...]
 └─ resolveConversationAuthz(client)  →  LeadReadScope { repIds, identityIds }
      ├─ loadConversation(store, id, scope)     (GET, compose, send, inbound)
      ├─ store.getLead(id, scope)               (draft PUT, thread-integrity check)
      ├─ store.markContacted(..., scope)        (send)
      └─ store.recordProspectReply(..., {scope}) (inbound, reply)
```

The store gates now accept **owner-in-scope OR sending-profile-authorized**. The unscoped
branch is untouched, so no legacy caller gained access: scope must be passed explicitly.

## Functional corrections

| Fix | File |
|---|---|
| `LeadReadScope.identityIds`; scoped gate accepts coverage | `store/types.ts`, `supabase-store.ts`, `mock-store.ts` |
| `resolveConversationAuthz()` mirrors queue authority | `lib/operations/conversation-authz.ts` |
| Thread/compose/send/draft/inbound/reply carry scope | `conversation/service.ts`, 6 API routes |
| Intelligence uses queue rep ids + authorized profiles | `lib/operations/chat-intelligence.ts`, `chats/page.tsx` |
| `scope=me` preserved in `current`/`linkState`/clear-filters | `chats/page.tsx` |
| Tab counts derived from the filtered candidate set | `lib/operations/chat-queue.ts` |
| Stage drill-down reaches closed (Won/Lost) conversations | `lib/operations/chat-queue.ts` |
| Intelligence failure returns null instead of erroring the thread | `chats/page.tsx` |

## Evidence

- **Unit contract** `tests/relay-ui-recovery.test.ts` — a teammate-owned lead is refused
  unscoped, refused with a narrow scope, and opens with a team scope; a covered profile opens
  only through `identityIds`; `markContacted` / `recordProspectReply` succeed for an
  authorized non-owner.
- **No-env suite** green (424 files / 5947 tests).
- **Fixture browser QA** unchanged and green: 18/18 interactions, all queue states × roles
  axe-clean. The fixture is deterministic and does **not** exercise authorization.

## Remaining limitations

- No browser proof against a populated database. The scope rule is proven by unit contract and
  code path, not by a live manager session.
- Outbound authorship in a shared thread still labels every outbound turn "You"
  (`lead-conversation.tsx`); once managers can open teammate threads, authorship should name the
  acting rep. Recorded rather than changed (thread model change).
- Message previews fall back to reading up to 4 full bodies per visible row when the
  `lead_message_previews` capability is absent; bounded but not eliminated.
