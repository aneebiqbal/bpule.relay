# Relay — Autonomous Email Revenue Engine — Status

**Date:** 2026-10-30
**Status:** AUDIT COMPLETE. ENGINE NOT READY. Provider, inbound sync, autonomy and
approval surfaces are **absent**, not partial.
**BASELINE SHA:** `19586b8b6f73dbf2588b27a28176ee5f01d893f6`
**DEPLOYED SHA:** unknown — Vercel CLI returns `forbidden` for this account.

This document is the running status artifact for the autonomous email engine. It
follows the house format of `docs/RELAY_AUTONOMOUS_OS_SOURCES_STATUS.md`:
phase → evidence → gate table → divergence to watch.

---

## 1. Audit scope and method

Four parallel read-only audits plus direct production verification:

| Subsystem | Method |
| --- | --- |
| Canonical conversation model | file + migration read, schema verified live via PostgREST |
| Outbound send path, sender identity, mailbox | file + migration read, `package.json` dependency scan |
| Research / drafting / message quality | call-chain trace from API to model call |
| Inbound replies, Today, scheduler, telemetry | route + ledger + telemetry table read |

Every schema claim below was confirmed against the **live production database**
(`fhnkanwvgamitrcuzpem`, 751 leads) on 2026-10-30, not inferred from migrations
alone.

---

## 2. Production baseline — verified, not assumed

| Fact | Value | Why it matters |
| --- | --- | --- |
| `email_messages` | **0 rows** | No live email history to migrate or reconcile |
| `prepared_email_drafts` | **0 rows** | No drafts in flight |
| `email_send_attempts` / `email_delivery_events` / `email_suppressions` | **0 rows each** | Delivery and suppression state are untested in production |
| `contact_points` | **0 rows** | §7 "recipient email available" can never pass today |
| `leads.email` | **column does not exist** | The address lives only in `contact_points.value` |
| Lead `status` values | `contacted` 605 · `followed_up` 48 · `new` 51 · `replied` 39 · `won` 4 · `lost` 3 · `no` 1 | There is **no `qualified`/`opportunity` status** |
| Lead `verdict` values | `send` 105 · `research_more` 587 · `skip` 43 · null 16 | `verdict='send'` is the real qualified-opportunity signal |
| `email_mailboxes` | 3 rows, all `provider='relay_noop'`, `status='CONNECTED'`, `bd+…@relay.test` | Mailboxes are placeholders, not connections |
| `email_sending_policies` | 3 rows, `daily_send_cap=200`, `working_hours 0–23`, `timezone='UTC'`, `follow_up_limit=1` | Send window is effectively "always"; timezone disagrees with the operating policy |
| `revenue_identities` | 11 rows: `linkedin` 5 · `upwork` 5 · `other` 1 · **`email` 0** | **No identity is flagged email-capable**, though the check constraint permits `'email'` |
| `identity_assignments` | 18 rows across 7 of 20 reps | Rep→identity authorization exists and is enforced at send |

**The connected database is production.** Every number above is a live read.

---

## 3. Architecture map

```
                         ┌──────────────────────────────────────────────┐
  POST /api/leads/[id]/email/prepare ──▶ prepareEmailDraft()            │
  POST /api/revenue/email/prepare    ──▶   │                            │
                                         ▼                            │
   lead + canonical facts ──▶ buildRevenueStrategy()                   │
                          ──▶ buildResearchBrief()   ◀── RESEARCH_BRIEF  │
                          ──▶ buildEmailStrategy()      is persisted    │
                          ──▶ generateEmailCopy()        but NOT sent   │
                                 │                        to the model   │
                                 ▼                                     │
                        validateEmailClaims()  ──▶ FAILED or READY      │
                                 │                                     │
                                 ▼                                     │
                      prepared_email_drafts  (READY | NEEDS_VERIFIED_…) │
                                                                         │
  POST /api/leads/[id]/email/send ──▶ sendPreparedEmail()               │
        │  1 idempotency pre-check   5 suppression check               │
        │  2 ownership + assignment  6 mailbox status = CONNECTED      │
        │  3 claim-safety gate      7 daily cap                        │
        │  4 contact VERIFIED/LIKELY_VALID                            │
        ▼                                                             │
   email_send_attempts(PENDING) ──▶ provider.send() ──▶ NO-OP ──▶ SENT  │
        │                              │                              │
        │                              └─ synthetic IDs, always accepted│
        ▼                                                             │
   messages(markContacted) · email_messages · email_delivery_events    │
   prepared_email_drafts→SENT · contact_points.last_used_at             │
                                                                         │
  POST /api/email/webhook (shared secret) ──▶ delivery events           │
        ├── DELIVERED/BOUNCED/FAILED ──▶ email_delivery_events         │
        ├── BOUNCED/UNSUBSCRIBE ──▶ email_suppressions + contact flip   │
        └── REPLIED ──▶ messages(inbound) · leads.status='replied'      │
                       · outcomes · conversation_states · relay event   │
```

**There is no second conversation universe today.** `messages` is the
conversation authority (Contract 11); `email_messages` is the delivery authority
with its own lifecycle. Both already exist and are distinct on purpose.

---

## 4. Classification — KEEP / EXTEND / REPLACE / REMOVE

### KEEP — correct, load-bearing, do not rewrite

| Piece | Owner | Why it stays |
| --- | --- | --- |
| `email_messages` table + indexes + RLS | `20260925000000_email_outreach_foundation.sql:299-353` | Already carries org, lead, identity, mailbox, contact point, direction, category, idempotency key, provider ids, delivery status and event timestamps |
| `unique (organization_id, idempotency_key)` + `unique (organization_id, provider, provider_message_id)` | same file `:326-327` | Provider-side dedupe is the reconciliation key §34 needs |
| `email_delivery_events` + `provider_event_id` unique | same file `:393-403` | Makes webhook ingestion idempotent |
| `email_suppressions` + webhook upsert | same file `:427-441`, `webhook/route.ts:253-293` | One suppression authority, already enforced at send |
| `prepared_email_drafts` incl. `research_brief`/`claim_safety`/`strategy` jsonb | same file `:246-273` | Evidence travels with the draft |
| `isSendEligibleContact` — single shared sendability definition | `src/lib/email/contact-points.ts:53-56` | Explicitly shared by prepare and send; must not fork |
| `validateEmailClaims` deterministic claim-safety gate | `src/lib/email/claim-safety.ts:30` | Blocks on `thingsNotToClaim`; repair by sentence deletion |
| `evaluateFollowUpPolicy` — canonical 3/6/6 clock | `src/lib/conversation/follow-up-policy.ts:108` | Retires the legacy DB trigger and the dead 24 h engine |
| `terminal.ts` + `checkOutreachAllowed` | `src/lib/conversation/terminal.ts:67-88` | Contract 5 owner; `allowReply` never blocks a rep answering |
| `thread-integrity.ts` + `THREAD_MISMATCH_REVIEW_REQUIRED` | `src/lib/conversation/thread-integrity.ts:22` | Already defined; just under-wired |
| `classifyConversationSignals` (13 signals) | `src/lib/conversation/conversation-intelligence-v2.ts:10-25` | Covers PRICING, MEETING_REQUEST, PROPOSAL_REQUEST, OBJECTION, DO_NOT_CONTACT, WON, LOST |
| `extractConversationFacts` | same file `:170` | 6 of 10 fact kinds implemented |
| `assessMessageQuality` / `feelsSurveillance` / `isGeneric` | `composer.ts:278`, `message-forge.ts:369,345` | Real quality gates, and the model-independent ones |
| `rankNextActions` Today ranking | `src/lib/relay/next-best-action.ts:52` | §25 says this stays the authority |
| `ai_traces` ids-only telemetry policy | `src/lib/observability/trace-context.ts:6` | Already satisfies §33's "no bodies in telemetry" |
| `operational_jobs` outbox + 8 job kinds | `20261030120200_operational_scheduler.sql:28-37` | `ENQUEUE_EMAIL` already exists; §30 says reuse, not rebuild |

### EXTEND — present but incomplete

| Piece | Gap |
| --- | --- |
| `email_messages` | No reply relationship (`in_reply_to`/`parent_message_id`), no `failure_reason`, no `received_at` |
| `email_mailboxes` | `secrets_ciphertext` exists and is **never read or written**; `status` is free text, not the 5-state health enum; no `last_sync_at`, no quota, no failure counters |
| `email_sending_policies` | `working_hours_start/end`, `timezone`, `minimum_delay_seconds`, `follow_up_limit`, `suppression_rules` are stored and editable but **never read in the send path** |
| `classifyConversationSignals` | No `OPT_OUT` enum value; `WRONG_PERSON` is a regex, not a class |
| `extractConversationFacts` | Missing `deliverable`, `timeline`, `decision_maker`, `objection`; team size not extracted |
| `thread-integrity` | Emitted only by the paste route; the `/reply` route and the webhook skip it |
| `action_events` | `channel='email'` is supported but **no outbound email send is ever recorded**; no `strategy`, message version or model on any event |
| `ENQUEUE_EMAIL` job | Routed in `run.ts:539-542` but returns `skipped: 'email_autopilot_not_enabled'` |
| `generateEmailCopy` input | Receives **5 strategy strings**, not the `ResearchBrief` built one line earlier — `recipient`, `sender`, `commercialSituation`, `primaryUncertainty`, `tone`, `proofToUse`, `ctaType` are all discarded |

### REPLACE — dead or wrong, must not be built on

| Piece | Problem |
| --- | --- |
| `relayNoopEmailProvider` | Fabricates IDs locally and always returns `accepted: true, status: 'SENT'`. §13/§14/§34 (delivery state, provider failure, resend-after-accept) are **unimplemented**, not partially implemented |
| `getEmailProvider(providerId)` | Ignores the id entirely — there is no provider registry |
| `noContactDiscoveryProvider` / `bd/email-engine.ts` noop | Same pattern; discovery cannot produce a sendable contact |
| `decideMessageQuality` | Documented as the single sendability decision (`buyer-request-plan.ts:354`) with **zero production callers** — only tests reference it |
| `deriveSalesThesis` | **No production callers.** The composer receives `thesis: null` on every call, so no message today is thesis-grounded |
| Two divergent `SalesThesis` types | `conversation/sales-thesis.ts` vs `scoring-v4/sales-thesis.ts`; the second is shadow/eval only |
| `email_sending_policies.timezone='UTC'` | Disagrees with `organization_operating_policy.timezone='Asia/Karachi'`; per Contract/TIMEZONE_GATE the operating policy is the sole authority |
| `ai_traces` correlation columns | `telemetry.ts` inserts `request_id`/`decision_run_id`/`failure_category`, catches the missing-column error and retries without them — §33's failure_category is silently dropped |
| Vercel `operational-scheduler` cron `0 4 * * *` | The outbox drains **once per day**, not every 10 minutes as the route comment claims; Supabase Cron is `*/10` but unverified |

### REMOVE — nothing

No existing piece should be deleted. The audit found no dead table, no
duplicate conversation store and no competing scheduler. The correct move is
extension, not replacement.

---

## 5. Hard blockers — human or deployment actions

These cannot be closed by writing code in this environment.

| Blocker | Blocks | Owner |
| --- | --- | --- |
| Gmail OAuth client ID/secret + authorized redirect URI | MAILBOX_CONNECTION_GATE, MAILBOX_SECURITY_GATE, REAL_PROVIDER_SMOKE | human |
| `secrets_ciphertext` encryption key | token storage, MAILBOX_SECURITY_GATE | human (key) + code (cipher) |
| Deployed callback URL reachable from Google | OAuth round-trip, BROWSER_GATE | deployment |
| `contact_points` empty and `leads.email` absent | EMAIL_ELIGIBILITY_GATE — no sendable address exists for any of the 751 leads | code (contact discovery) + data |
| No `verdict='send'` lead has a verified contact | cold-outreach E2E | data |
| Operational scheduler unverified (`19586b8` not deployed) | every scheduler-dependent gate | deployment |
| Vercel CLI `forbidden` | SHA_GATE, DEPLOYED SHA verification | human |

---

## 6. Canonical conversation — decision (§2)

> **One decision, made now: `email_messages` is extended, not replaced, and no
> second conversation store is created.**

`messages` remains the conversation authority (Contract 11). `email_messages`
becomes the **email delivery authority** with an explicit reply relationship
back to `messages`. The two lifecycles are genuinely different — a `messages`
row is a conversation turn with no delivery semantics; an `email_messages` row
is a provider artifact with delivery semantics and no meaning outside the
thread. Adding `messages`-style rows for inbound email today already happens in
`webhook/route.ts:58` and is kept.

The gaps to close in `email_messages` (one migration, in the DATA MODEL phase):

| Missing | Purpose |
| --- | --- |
| `in_reply_to_provider_message_id` | Reply relationship — §2 "reply relationship" |
| `failure_reason` / `failure_code` | §14 "classify failure" (currently only on `email_send_attempts`) |
| `received_at` | Distinct inbound timestamp from `replied_at` |
| `sender_profile_id` | Mailbox identity link — §3 "connection belongs to a sender profile" |
| `autonomy_mode` on the draft, not the message | §6 mode is a policy of the action, not a property of a sent row |

---

## 7. Gate matrix — honest status

No gate is inferred from another.

| Gate | Status | Evidence |
| --- | --- | --- |
| MAILBOX_CONNECTION_GATE | **BLOCKED** | No OAuth route, no token storage, `secrets_ciphertext` unread |
| MAILBOX_SECURITY_GATE | **BLOCKED** | No token encryption, no cross-org mailbox test |
| EMAIL_ELIGIBILITY_GATE | **NOT_RUN** | No canonical `EmailSendDecision` object exists |
| MESSAGE_QUALITY_GATE | **NOT_RUN** | `validateEmailClaims` exists; `decideMessageQuality` has no production caller |
| SEND_IDEMPOTENCY_GATE | **NOT_RUN** | Unique key present and correct; no `23505` race handling on the email insert |
| DELIVERY_STATE_GATE | **NOT_RUN** | Provider is a no-op; `QUEUED/SENDING/FAILED/REJECTED` unreachable |
| REPLY_INGESTION_GATE | **NOT_RUN** | Push-only webhook; no poll/sync worker, no history cursor |
| THREAD_MATCH_GATE | **NOT_RUN** | `THREAD_MISMATCH_REVIEW_REQUIRED` defined but emitted on one route only |
| REPLY_INTELLIGENCE_GATE | **NOT_RUN** | Deterministic 13-signal classifier exists; `OPT_OUT`/`WRONG_PERSON` missing; no fact extraction for 4 kinds |
| FOLLOWUP_GATE | **NOT_RUN** | Canonical policy exists and is reused; no email-specific due job |
| SUPPRESSION_GATE | **NOT_RUN** | Send path checks suppressions; Today queue and scheduler do not |
| RATE_LIMIT_GATE | **NOT_RUN** | Only `daily_send_cap` enforced; no hourly cap, spacing, failure or bounce threshold |
| TODAY_INTEGRATION_GATE | **NOT_RUN** | `EMAIL_FUTURE` channel exists but is never assigned |
| OUTCOME_TRACKING_GATE | **NOT_RUN** | No outbound email in `action_events`; no strategy/version/model |
| MULTITENANT_GATE | **NOT_RUN** | RLS present; no email cross-org test |
| FAILURE_RECOVERY_GATE | **NOT_RUN** | No provider-accepted-but-persist-failed reconciliation |
| BROWSER_GATE | **NOT_RUN** | Requires deployment |
| REAL_PROVIDER_SMOKE | **BLOCKED** | Requires Gmail credentials |

| Code gate | Status |
| --- | --- |
| TYPECHECK | **PASS** at `19586b8` |
| LINT | **PASS** at `19586b8` |
| BUILD | **PASS** at `19586b8` |
| FULL_TESTS | **PASS** at `19586b8` (234 test files; 7 email-related) |
| SHA_GATE | **NOT_VERIFIED** — deployed SHA unknown |
| PRODUCTION_SMOKE | **NOT_RUN** |

---

## 8. Next phases

| Phase | Deliverable | Blocked by |
| --- | --- | ---|
| CONTRACT | Land the §6 decisions in `docs/RELAY_PRODUCT_CONTRACTS.md` + runtime map + dependent tests **in one change**, per `docs/RELAY_CONTRACT_CHANGE_PROCESS.md` | — |
| DATA MODEL | Migration: reply relationship, failure reason, `received_at`, `sender_profile_id`, mailbox health columns, organization email policy table | — |
| PROVIDER | `EmailProvider` registry + Gmail OAuth implementation behind the existing interface | **human** (credentials) |
| SENDING | Real send, `QUEUED→SENDING→SENT`, retry, resend-after-accept reconciliation | DATA MODEL |
| REPLIES | `SYNC_MAILBOX` worker with history cursor; reply-to-lead matching with confidence | DATA MODEL |
| FOLLOW-UP | `SEND_FOLLOWUP` job on the canonical clock | DATA MODEL + scheduler verified |
| AUTONOMY | `EmailSendDecision` + MANUAL/APPROVAL_REQUIRED/AUTOPILOT + safe-class policy | DATA MODEL |
| UI | Approval queue, Settings→Mailboxes, Admin health | PROVIDER |
| OBSERVABILITY | Email metrics in Admin Command; `failure_category` column actually created | DATA MODEL |
| SECURITY | OAuth state/PKCE, token encryption, cross-org and spoofing tests | PROVIDER |
| E2E | Browser flows per §37 | deployment |
| PRODUCTION PROOF | Controlled internal mailboxes only | **human** |

---

## 9. Known risks

1. **`decideMessageQuality` and `deriveSalesThesis` are production-dead.** Anything
   §8/§10/§11 says to "reuse" there must be **rewired** first. That is a
   deliberate change to two documented owners, not an assumption.
2. **`contact_points` is empty and `leads` has no email column.** The eligibility
   gate cannot pass for any lead until contact discovery runs. This is a data
   prerequisite, not a code one, and it gates the entire cold-outreach E2E.
3. **No identity is flagged `channel='email'**, though the check constraint permits
   it and the send path does not filter on it. §3's "mailbox belongs to a sender
   profile" needs a decision about whether `channel` is the capability flag.
4. **The scheduler drains once per day** (`0 4 * * *` UTC), while §30 assumes a
   10-minute cadence. Every time-sensitive email gate is therefore scheduler-
   dependent and must be marked honestly until the drain cadence is real.
5. **`ai_traces` correlation columns are silently dropped.** §33 requires
   `failure_category` in tracing; today it is caught and discarded.
6. **No `OPT_OUT` class.** Opt-out is modelled as `DO_NOT_CONTACT` plus a
   suppression row. §17's `OPT_OUT` class must map onto that rather than add a
   third representation.

---

## 10. Verdict

**AUTONOMOUS EMAIL ENGINE: NOT READY**

The schema and safety scaffolding are real and worth keeping. The provider, the
inbound sync path, the autonomy/approval loop, the strategy set, the quality
wiring and the outcome ledger are absent. Nothing in this audit contradicts the
spec; several things it asks to "reuse" are dead code that must be rewired
first.
