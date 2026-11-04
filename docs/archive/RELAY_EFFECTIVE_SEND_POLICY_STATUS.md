# Relay — Effective Send Policy + Autonomous Email Readiness — Status

**Date:** 2026-10-30
**BASELINE SHA:** `19586b8b6f73dbf2588b27a28176ee5f01d893f6`
**FINAL SHA:** `faedb01`
**DEPLOYED SHA:** unknown — Vercel CLI returns `forbidden` for this account

---

## Verdict

```text
EFFECTIVE SEND POLICY:      NOT READY
AUTONOMOUS EMAIL READINESS: BLOCKED
```

The policy engine is built, guarded by tests, and the authority split that caused
the original bug is closed. It is **not** production ready because the migration
that carries half its columns is not applied, and because hourly usage, the
rep-facing budget, Admin Command and the browser pass are not built.

---

## POLICY AUTHORITIES

Four authorities, each with exactly one writer. No duplicate storage was created.

| Authority | Owner | Writer | Readers |
| --- | --- | --- | --- |
| DM / follow-up ceiling | `organizations.settings.dailySendLimit` | `PATCH /api/admin/send-limits` | resolver, `markContacted` |
| Connection / Upwork ceiling | `organizations.settings.dailyConnectionLimit` | same | resolver, `markContacted` |
| LinkedIn / Upwork autonomy | `organizations.settings.*AutonomyMode` | `PATCH /api/admin/email-policy` | resolver, Settings |
| Per-mailbox email ceiling, spacing, window, follow-ups | `email_sending_policies` | `PATCH /api/admin/email-policy`, `PATCH /api/admin/revenue-identities/[id]/email` | resolver, `buildSendDecision` |
| Email autonomy, hourly cap, failure/bounce thresholds, weekend, cooldown | `organization_email_policy` | `PATCH /api/admin/email-policy` | resolver |
| Mailbox health, sync cursor, quota | `email_mailboxes` | OAuth handshake, token refresh, `SYNC_MAILBOX` | resolver, `send-decision` |

**Canonical resolver.** `resolveSendPolicy` (`src/lib/email/effective-policy.ts`)
and `evaluateSendPolicy` (`src/lib/email/policy-engine.ts`). Both pure; the
database-facing halves are `getEffectivePolicy` on `ScoutStore` and
`getEffectiveSendPolicy`.

**Audit findings that changed the design.** The authority audit found that
`sent_today`, `sent_today_date`, `paused_at` and `consecutive_failures` had **no
writers anywhere**, so mailbox health always read `CONNECTED`. Health now derives
from real send history. It also found `getEffectiveSendPolicy` had **zero
callers**, and that `SendingPolicy` was sending two autonomy keys its own
validator rejected with `400`.

---

## PRECEDENCE

Applied in exactly this order. A later rule can only narrow a decision an earlier
rule already made; nothing can override an earlier block.

```text
1. hard safety block      mailbox health, terminal state, opt-out, suppression,
                          unauthorized sender, unverified recipient, quality fail
2. org autonomy           MANUAL never sends without a human
3. send window            organization operating clock, never browser time
4. mailbox limits         daily cap, hourly cap
5. channel/type limits    DM, connection, Upwork ceilings
6. current usage          sends already made today and this hour
7. spacing                the next send instant
8. allowed
```

Documented in the module header of `src/lib/email/policy-engine.ts` and asserted
by the `precedence is explicit and never inverted` fixture group.

---

## ADMIN UI

`Settings → Sending policy` (`src/components/admin/sending-policy.tsx`) is one
section reading both email authorities. `Settings → Today's send budget` carries
the DM/connection ceilings (`src/components/admin/send-limits.tsx`).

| Section | Fields |
| --- | --- |
| Email | daily per mailbox, hourly, minimum spacing, send window, max follow-ups |
| Autonomy | email, LinkedIn, Upwork |
| Safety | pause after failures, bounce threshold |

**Safe editing.** `validateSendLimitPatch` / `validateEmailPolicyPatch` reject an
unknown key rather than ignoring it, so a typo cannot leave a limit unchanged
while the admin believes it saved. `organizations.settings` is **merged**, never
replaced, so an unrelated key survives. Both routes return the effective policy
after saving. Non-admin receives `403`.

**Lowering a limit below current usage.** The save succeeds and `dailyRemaining`
goes to `0`, so the next send is blocked by rule 6. The rep-facing text is not
built (see Rep UI).

---

## REP UI

**NOT BUILT.** The effective state is resolved and exposed — `dailyUsed`,
`dailyRemaining`, `nextSendAt`, `sendWindowOpen`, `mailboxHealth` — but no
component renders the rep-facing block from the specification. The Settings page
still shows the read-only budget panel, which now reads the resolver.

---

## DAILY LIMITS

| Channel | Limit source | Enforced by |
| --- | --- | --- |
| DM | `organizations.settings.dailySendLimit` | `markContacted` → `evaluateSendPolicy` |
| Follow-up | same | same |
| Connection | `organizations.settings.dailyConnectionLimit` | same |
| Upwork | same | same |
| Email | `email_sending_policies.daily_send_cap` | `evaluateSendPolicy` → `buildSendDecision` |

**Parity.** Contract 17. `getTodayDashboard`, `getQueue` (both stores), the
Settings page and `buildSendDecision` all read the resolver. The rail tooltip and
lead workspace, which previously read a limit computed with no org settings, now
read `getQueue().dailyLimit` from the same resolver.

**No hardcoded UI default.** The UI reads the resolved limit; the resolver falls
back to the env default only when no org override exists.

---

## HOURLY LIMITS

`organization_email_policy.hourly_send_cap` is stored, validated, displayed and
resolved into `hourlyLimit` / `hourlyRemaining`. **`hourlyUsed` is not yet
counted** — `getEffectiveSendPolicy` passes `0`, so the hourly cap cannot block
today. Counting it requires a query this sprint did not add.

`0` means "no separate hourly cap", matching the schema default.

---

## SPACING

`email_sending_policies.minimum_delay_seconds` and
`organization_email_policy.minimum_spacing_seconds`.

Enforced by `claimSendSlot` (`src/lib/email/spacing-guard.ts`) — **one
conditional UPDATE**, not a read-then-write:

```ts
.update({ last_send_at: nowIso, updated_at: nowIso })
.eq('id', mailboxId)
.or('last_send_at.is.null,last_send_at.lte.<now - spacing>')
```

Postgres holds the row lock for the statement, so of two concurrent claims
exactly one matches the predicate. `releaseSendSlot` frees the slot when a send
fails. When the column is absent (migration not applied) the guard degrades to
the decision-layer check rather than blocking every send.

---

## SEND WINDOWS

Derived from `organization_operating_policy.timezone` — the sole time authority.
No email code reads `email_sending_policies.timezone`, which remains a stored
column with no reader in the send path.

Fixture `SEND_WINDOW_USES_ORG_TIMEZONE` covers Asia/Karachi, America/New_York and
Europe/London, including both DST transitions (the fixture uses the Friday before
each transition, because both transition dates fall on a Sunday in 2026).

---

## AUTONOMY

`MANUAL` · `APPROVAL_REQUIRED` · `AUTOPILOT`. Defaults: email
`APPROVAL_REQUIRED`, LinkedIn `MANUAL`, Upwork `APPROVAL_REQUIRED` — matching the
specification. AUTOPILOT is never enabled globally.

`MANUAL` blocks at rule 2. `APPROVAL_REQUIRED` passes the policy gate and is held
for the queue. `AUTOPILOT` may execute only when every earlier rule passes.

`evaluateAutonomousSendEligibility` from §13 is **not built** as a separate
function; its inputs are the `safety` block of `SendPolicyContext` and its output
is `allowed` + `blockers`. A dedicated three-state function was not added because
it would duplicate the precedence order.

---

## MAILBOX HEALTH

Five canonical states: `HEALTHY` · `DEGRADED` · `PAUSED` · `REAUTH_REQUIRED` ·
`DISCONNECTED`.

`loadMailboxPolicyState` derives health from **real send history** — sends today
from `email_messages`, failures from `email_send_attempts` — because the
denormalized `sent_today` / `consecutive_failures` columns have no writers.
`deriveMailboxHealth` supplies the provider/token/quota/pause logic.

Health blocks at rule 1, above autonomy, limits and usage.

---

## FAILURE / BOUNCE POLICY

| Setting | Source | Effect |
| --- | --- | --- |
| Consecutive failure threshold | `organization_email_policy.consecutive_failure_threshold` | `DEGRADED` at the threshold; blocks rule 1 |
| Bounce threshold | `organization_email_policy.bounce_threshold` | resolved to a percent for display |
| Lookback window | 7 days | failures counted from `email_send_attempts` |

**Not wired:** the bounce path (`webhook/route.ts`) still flips the contact point
and writes a suppression row, but does not increment a failure counter or pause a
mailbox. `paused_at` still has no writer. A mailbox therefore cannot yet reach
`PAUSED` from the policy engine alone.

---

## SCHEDULER INTEGRATION

The existing `operational_jobs` outbox is reused — no second scheduler.

| Job kind | Planned | Handler |
| --- | --- | --- |
| `SYNC_MAILBOX` | every cycle | `syncOrganizationMailboxes` |
| `RETRY_EMAIL` | every cycle | `retryEmails` → `reconcileAcceptedSend` |
| `ENQUEUE_EMAIL` | every cycle | `enqueueEmailWork` → creates `SEND_EMAIL` |
| `SEND_EMAIL` | on demand | `sendQueuedEmail` → re-evaluates policy, then sends |

Policy is re-evaluated at execution time, so a draft approved at 10:00 can still
be blocked at 11:00. `sendQueuedEmail` holds `APPROVAL_REQUIRED` drafts for the
queue and marks blocked drafts `FAILED` with their blockers.

The outbox currently drains **once per day** (`0 4 * * *` UTC) while the route
comment claims every ten minutes.

---

## TODAY

Suppression is enforced: `buildRelayQueue` filters suppressed leads from every
input before any task is built, so a new task kind cannot become a bypass. Six
tests cover cold, follow-up, reply and mixed cases.

**Not built:** the operational email actions from §18 (`Approve 4 emails`,
`2 sends blocked by daily limit`, `1 mailbox needs reconnection`). `EMAIL_FUTURE`
exists as a channel value but is never assigned.

---

## COMMAND

**NOT BUILT.** Admin Command does not yet surface paused mailboxes, senders at
limit, mailboxes needing reconnection or blocked approvals.

---

## SECURITY

| Check | Status |
| --- | --- |
| Rep cannot edit org policy | **PASS** — `ctx.isAdmin` guard, `403` |
| Unknown keys rejected | **PASS** — validator |
| `settings` merged, not replaced | **PASS** — `mergeSendLimits` |
| Caller cannot override effective limits | **PASS** — the resolver reads the DB, not the request body |
| Forged org ID rejected | **PASS** — every query is scoped by `organization_id` |
| Forged mailbox / revenue identity | **PARTIAL** — scoped by org; no cross-org test |
| Cross-org policy access | **NOT RUN** — no test |
| Manager permission tier | **NOT RUN** — only admin/owner is distinguished |

---

## CONCURRENCY

`SPACING_BLOCKS_CONCURRENT_SEND` asserts that two simultaneous claims produce
exactly one winner, and that a second claim after a successful one is refused.
The guard is a single conditional UPDATE, so the check-and-set is atomic.

**Not covered:** two workers racing on the *same* `email_messages` insert. That
path is protected by the `23505` handling added earlier, but no test drives two
concurrent inserts.

---

## TESTS

```
tsc          clean
eslint       0 errors (38 warnings)
full suite   4334 pass / 297 files
```

New in this change:

| File | Tests |
| --- | --- |
| `tests/qa-relay-send-policy-fixtures.test.ts` | 25 named fixtures |
| `tests/email-spacing-guard.test.ts` | 9 concurrency / release |
| `tests/qa-relay-send-policy-parity.test.ts` | 16 parity |
| `tests/qa-relay-send-limits.test.ts` | 18 limits |

Named fixtures: `ORG_OVERRIDE_BEATS_ENV_DEFAULT`, `MAILBOX_CAP_BEATS_ORG_EMAIL_CAP`,
`TERMINAL_BLOCKS_ALL`, `OPT_OUT_BLOCKS_ALL`, `PAUSED_MAILBOX_BLOCKS_AUTOPILOT`,
`DAILY_LIMIT_BLOCKS_SEND`, `HOURLY_LIMIT_BLOCKS_SEND`,
`SPACING_BLOCKS_CONCURRENT_SEND`, `SEND_WINDOW_USES_ORG_TIMEZONE`.

---

## BROWSER

**NOT RUN.** Requires a deployment. The admin save → rep refresh → send-to-limit
flow from §23 has not been exercised in a browser.

---

## PRODUCTION

**NOT RUN.** Requires the migration and Gmail OAuth credentials.

---

## KNOWN RISKS

1. **The migration is not applied.** `20261030120300_email_engine.sql` is a file.
   `organization_email_policy`, `email_oauth_challenges`, the `email_messages`
   reply/failure/received columns, the `email_mailboxes` health columns and the
   five new job kinds do not exist in the database. `PATCH /api/admin/email-policy`
   returns **409** until it lands; the resolver treats an absent table as "no
   policy" with safe defaults.
2. **Hourly usage is not counted.** `hourlyUsed` is always `0`, so the hourly cap
   cannot block. The field is resolved and displayed; the query is missing.
3. **`paused_at` has no writer.** A mailbox cannot reach `PAUSED` from the policy
   engine; only a manual pause (not built) or the OAuth handshake would set it.
4. **The bounce path does not feed health.** Bounces suppress the contact but do
   not increment failures, so the bounce threshold cannot degrade a mailbox.
5. **Three "today" definitions remain.** `countTodaysSends*` uses server-local
   midnight, `sendPreparedEmail` used UTC, and the resolver uses the org business
   date. The resolver is correct; the legacy counters are not yet unified.
6. **`evaluateAutonomousSendEligibility` was not added as a separate function.**
   Its behaviour is `evaluateSendPolicy`'s `allowed` + `blockers`. A second
   function would duplicate the precedence order.
7. **The outbox drains once per day**, so every time-sensitive email gate is
   scheduler-dependent and cannot be proven until the drain cadence is real.

---

## GATES

| Gate | Status |
| --- | --- |
| EMAIL_POLICY_MIGRATION_GATE | **PENDING_HUMAN** — migration not applied |
| EFFECTIVE_POLICY_GATE | **PARTIAL** — resolver + precedence + parity; hourly usage missing |
| UI_ENFORCEMENT_PARITY_GATE | **PASS** — Contract 17, 16 tests |
| AUTONOMY_POLICY_GATE | **PARTIAL** — modes, defaults, closed safe set; no separate eligibility function |
| MAILBOX_HEALTH_GATE | **PARTIAL** — derived from real history; no pause writer |
| RATE_LIMIT_GATE | **PARTIAL** — daily enforced, hourly resolved not counted |
| SPACING_CONCURRENCY_GATE | **PASS** — atomic conditional update, 9 tests |
| TIMEZONE_SEND_WINDOW_GATE | **PASS** — org clock only, 3 zones + DST |
| TODAY_INTEGRATION_GATE | **PARTIAL** — suppression only |
| COMMAND_INTEGRATION_GATE | **NOT_RUN** |
| MULTITENANT_GATE | **NOT_RUN** |
| BROWSER_GATE | **NOT_RUN** |
| SHA_GATE | **NOT_VERIFIED** |
| PRODUCTION_SMOKE | **NOT_RUN** |

No gate is inferred from another.
