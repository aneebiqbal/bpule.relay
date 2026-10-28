# Relay Observability Audit

**Release-gating artifact.** What production traces carry, per surface, and the
gaps that remain. The contract: a failure event must carry enough to identify the
tenant, the lead (where relevant), the feature, the provider/model, the latency
and a failure category.

---

## Surfaces

| Surface | Trace today | request_id | organization_id | lead_id | feature | provider/model | latency | failure category |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Analysis (prospect) | `[relay-ai]` runtime line + `ai/trace` pipeline line | – | – | – | ✓ | ✓ | ✓ | – |
| Decision | `[relay-ai]` + persisted `decision_run_id` | ✓ (persisted) | – | ✓ (persisted) | ✓ | ✓ | ✓ | – |
| Message generation | `[relay-ai]` runtime line | – | – | – | ✓ | ✓ | ✓ | – |
| Follow-up | follow-up policy reason (persisted in conversation state) | – | – | ✓ | – | – | – | ✓ (reason) |
| Reply | `classifyInboundReply` outcome + persisted reply row | – | – | ✓ | – | – | – | ✓ (outcome) |
| Studio generation | `imageFailureReason` string | – | – | – | – | – | – | ✓ (category) |

The `[relay-ai]` line carries: `task`, `provider`, `model`, `attempt`,
`input_tokens`, `output_tokens`, `ttfb`, `latency`, `cost`, `runtime`, `site`,
`feature`, `tier`, `prompt`, `cache`, `fallback`, `skipped`, `schema`, `error`.

---

## Status — closed in this pass

| Gap | Resolution |
| --- | --- |
| No tenant or lead on the runtime trace | `TraceContext` (AsyncLocalStorage) carries `requestId`, `organizationId`, `leadId`, `jobId`, `repId`, `decisionRunId`; `generate` reads the ambient context when the caller does not pass ids. |
| No structured failure category | `AiFailureCategory` + `classifyAiFailure`; `persistTrace` writes `failure_category`; the raw `error` is kept separately. |
| No request_id correlation | One `requestId` per user request (`newRequestId`), propagated through every AI call and persisted on `ai_traces` (`request_id`, `decision_run_id`). The `[relay-ai]` line carries `req=… lead=… failure=…`. |

Persisted trace columns: `request_id`, `decision_run_id`, `failure_category` (with
a graceful fallback when the migration has not been applied).

### Privacy

Traces carry ids, feature, provider, model, latency, tokens, cost, attempt,
fallback and failure category. They do **not** carry the raw source paste, client
messages, generated messages, emails or phone numbers. A regression test asserts
the persisted row contains none of those keys.

### Remaining

- The `ai_traces` migration for the three new columns still needs to be applied
  in production (the persistence falls back gracefully until then).
- Dashboards should read `failure_category`, never parse the free-text `error`.

---

## Related

- Contract violations: `src/lib/relay/contract-violations.ts` — a forbidden
  state is recorded, never silently corrected.
