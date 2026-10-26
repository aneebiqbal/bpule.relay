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

## Gaps

1. **No tenant or lead on the runtime trace.** The `[relay-ai]` line identifies
   the feature and the model but not which organization or lead produced it. A
   production incident cannot be scoped from the trace alone.
2. **No structured failure category on AI traces.** The `error` field is free
   text. `imageFailureCategory` exists for Studio but is not emitted as a
   structured field on the trace.
3. **No request_id correlation.** Persisted rows carry `decision_run_id`, but
   the log line does not, so log and row cannot be joined.

---

## Remediation (not done in this sprint)

- Add `organization_id` and `lead_id` (where the call site has them) to the
  `[relay-ai]` trace, redacted to the id only — never the raw source text.
- Emit a structured `failure_category` alongside `error`.
- Add `request_id` to the trace and join it to `decision_run_id`.

**Avoid sensitive raw data.** Traces carry ids and model metadata, not client
messages or source text.

---

## Related

- Contract violations: `src/lib/relay/contract-violations.ts` — a forbidden
  state is recorded, never silently corrected.
