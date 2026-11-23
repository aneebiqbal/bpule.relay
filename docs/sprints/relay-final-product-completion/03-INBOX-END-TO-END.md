# Inbox end to end

## State inherited from the previous sprint

The queue/conversation/intelligence authority mismatch was fixed at `23231c65` and is unit-proven
(`tests/relay-ui-recovery.test.ts`). This program corrected two further queue behaviours:

- **SR-14/P2** tab counts are now derived from the filtered candidate set, so Age/Stage filters
  cannot leave badges showing totals the list no longer contains; Won/Lost drill-downs reach
  closed conversations.
- **SR-U11/P2** thread-review `total` now equals the review-match population it counts.

## Browser evidence available

| Suite | Result | Covers |
|---|---|---|
| `scripts/qa/inbox-interactions.mjs` | **18/18**, axe clean at 1440/1024/375 | queue selection, filters, composer menu, context drawer, Escape/focus restore, mobile flow |
| `scripts/qa/inbox-states.mjs` | all states × roles axe-clean | Needs reply, Waiting, Follow-ups, All, Closed, manager view |

## Scenarios A–F from the brief: honest status

| Scenario | Status |
|---|---|
| A — Owner journey | **BLOCKED** (authenticated session required) |
| B — Manager opens authorized teammate conversation | **BLOCKED live**; the exact regression is unit-covered by `CONVERSATION_SCOPE_PARITY` |
| C — Member sees only owned/covered; direct unauthorized ID denied | **PARTIAL** — rule proven in unit test; no live request |
| D — Cross-organization isolation | **NOT RUN** |
| E — Failure handling (empty, long thread, missing lead, provider timeout, rapid switching) | **PARTIAL** — fixture covers empty/selection/keyboard; failure injection not run |
| F — Conversation actions and honest delivery claims | **PARTIAL** — composer labels verified in source; no live send path exercised |

## Fixture limitation, stated plainly

`/inbox-fixture` is deterministic and auth-free. It verifies interaction quality of the Inbox
component set, **not** authorization. The manager authorization fix is verified by unit contract,
not by a real manager session.
