# Relay Documentation Index

**Start here.** This index separates living contracts from the historical
record so a new engineer can orient in under two minutes.

Classification: **CURRENT** (active contract) · **TOOLING** (read or written by
tests/scripts/CI — do not move without updating them) · **HISTORICAL** (past
state, kept for context) · **ARCHIVE** (`docs/archive/`).

> Dated status reports, point-in-time audits and completed program plans have
> been moved to `docs/archive/`. They are evidence, not contracts.

---

## 1. Current product

| Doc | Class | What it is |
|---|---|---|
| `RELAY_FEATURE_VISIBILITY_MATRIX.md` | **CURRENT** | Feature × role × entry-point matrix |
| `RELAY_COMPLETE_ROUTE_AND_ROLE_MAP.md` | **CURRENT** | Full route + role inventory with per-route gating |
| `RELAY_NAVIGATION_V3.md` | **CURRENT** | Role-aware navigation contract (V4 shell) |
| `RELAY_DEAD_CODE_REMOVAL_REPORT.md` | **CURRENT** | What was removed, what was kept, and why |
---

## 2. Architecture and UI system

| Doc | Class | What it is |
|---|---|---|
| `RELAY_UI_SYSTEM_V2.md` | **CURRENT** | Design-system contract (V3/V4 primitives build on it) |
| `RELAY_CONTRACT_RUNTIME_MAP.md` | **TOOLING** | Every contract → owning module → consumers → tests |
| `RELAY_CONTRACT_CHANGE_PROCESS.md` | **CURRENT** | How contracts may be changed |
| `RELAY_PRODUCT_CONTRACTS.md` | **TOOLING** | Business-rule contracts |
| `SENDER_ROUTING.md` | **CURRENT** | Sending-profile routing rules |
| `FOLLOWUP_POLICY_MAP.md` | **CURRENT** | Follow-up cadence authority map |

### Per-surface contracts

`RELAY_V3_INBOX.md` ·
`RELAY_V3_TEAM_OPERATIONS.md` · `RELAY_V3_CONTENT_STUDIO.md`

Superseded per-surface contracts and point-in-time status maps
(`RELAY_NAVIGATION_V2.md`, `RELAY_ADMIN_COMMAND_CENTER_V2.md`,
`RELAY_MANAGER_HOME_V2.md`, `RELAY_SALES_WORKSPACE_V2.md`,
`RELAY_TASK_SYSTEM_V2.md`, `RELAY_REP_HOME_V2.md`,
`RELAY_OPERATIONS_WORKSPACE_V2.md`, `RELAY_CURRENT_PRODUCT_STATE.md`) live in
`docs/archive/` — the V2/V3 shell they describe has been deleted.

---

## 3. Scoring

`SCORING_ARCHITECTURE.md` · `SCORING_INVARIANTS.md` (**TOOLING**) ·
`SCORING_RELEASE_CHECKLIST.md` · `UPWORK_SCORING.md` ·
`GOLDEN_SET.md` (**TOOLING**, reference data)

---

## 4. Database, auth and infrastructure

| Doc | Class | What it is |
|---|---|---|
| `RELAY_NEON_CUTOVER_FINAL.md` | **CURRENT** | Required env vars, region, Supabase rollback path |
| `RELAY_PHASE8_DATABASE_CONTRACTS.md` | **CURRENT** | DB schema contracts (Neon catch-up noted in-doc) |
| `RELAY_MIGRATION_RECONCILIATION_2026-11.md` | **CURRENT** | Latest migration reconciliation |
| `RELAY_SUPABASE_APPLICATION_DEPENDENCY_MAP.md` | **CURRENT** | Rollback-path dependency map |
| `RELAY_NEON_AGGREGATE_SLICE.md` | **CURRENT** | Analytics SQL aggregates |
| `RELAY_NEON_ANALYTICS_EGRESS.md` | **CURRENT** | Analytics egress design |
| `RELAY_NEON_EGRESS_BUDGET.md` | **CURRENT** | Egress budget model |
| `RELAY_NEON_EGRESS_AUDIT.md` | **HISTORICAL** | Egress audit evidence |
| `RELAY_OPERATIONS_EGRESS_AUDIT.md` | **TOOLING** | Ops egress audit |
| `RELAY_PREVIEW_QA_POLICY.md` | **CURRENT** | Preview environment QA policy |

---

## 5. Security and privacy

`PII_GIT_REMEDIATION.md` — **open P0**. Prescribes the gitignore/untrack step
(done) and the remaining history rewrite + credential rotation (owner-assigned).

---

## 6. Operations and release

`RELAY_PRODUCTION_ACTIVATION_RUNBOOK.md` (**CURRENT**, links the Neon cutover) ·
`RELAY_PRODUCTION_TEST_DATA_CLEANUP.md` (**TOOLING**, script output target)

---

## 7. QA

`QA_END_TO_END.md` (**TOOLING**) ·
`RELAY_BUG_23_31_CLOSURE.md` (**TOOLING**) ·
`RELAY_PHASE8_SYNTHETIC_CERTIFICATION.md` (**TOOLING**) ·
`RAW_TEXT_READER_INVENTORY.md`

---

## 8. Archive (`docs/archive/`)

Dated activation/status reports, point-in-time audits, completed program plans
and superseded architecture. Kept because they explain security remediation,
migration history, production incidents, data cleanup and the Neon cutover.

---

## 9. Known gaps

- `RELAY_NAVIGATION_V3.md` names V4 surfaces; rename only with the V4 freeze.
- `RELAY_COMPLETE_ROUTE_AND_ROLE_MAP.md` route counts date from Oct 25.
