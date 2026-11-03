# Relay Documentation Index

**Purpose:** one place to find the *current* contract for anything. 81 docs exist;
most are dated status/audit reports from earlier sprints. This index separates the
living contracts from the historical record.

Classification: **CURRENT** (active contract) · **HISTORICAL** (past state, keep for context) ·
**SUPERSEDED** (replaced by a newer doc) · **INTERNAL AUDIT** (point-in-time findings)

> Historical docs are not deleted. The plan is to move them to `docs/archive/` in a
> later, separate change — moving files now would invalidate links in git history and
> prior reports. Nothing has been moved yet.

---

## 1. Stabilization (this program)

| Doc | Class | What it is |
|---|---|---|
| `RELAY_STABILIZATION_INVENTORY.md` | **CURRENT** | Phase 1 — every route/component classified; `UNKNOWN` register |
| `RELAY_COMPONENT_QUALITY_AUDIT.md` | **CURRENT** | Phase 2 — visual component quality, reuse targets, duplicate register |
| `RELAY_FEATURE_VISIBILITY_MAP.md` | **CURRENT** | Phase 3/4 — feature × entry-point matrix (gate now PASS) |
| `RELAY_ERP_NAVIGATION.md` | **CURRENT** | Phase 4 — ERP role-aware IA (superseded by `RELAY_NAVIGATION_V3.md`) |
| `RELAY_REPOSITORY_RECONCILIATION.md` | **CURRENT** | Worktree forensics, sprint recovery, conflict resolutions |
| `RELAY_CURRENT_PRODUCT_STATE.md` | **CURRENT** | Reconciled product map and live-certification status |
| `RELAY_NAVIGATION_V3.md` | **CURRENT** | Final role-aware navigation contract |
| `RELAY_FEATURE_VISIBILITY_MATRIX.md` | **CURRENT** | Final feature × role × entry-point matrix |

---

## 2. Current architecture

| Doc | Class | What it is |
|---|---|---|
| `RELAY_INFORMATION_ARCHITECTURE_V2.md` | **CURRENT** | Sprint 1 Phase 0 IA — target nav, route dispositions |
| `RELAY_COMPLETE_ROUTE_AND_ROLE_MAP.md` | **CURRENT** | Full route + role inventory with per-route gating |
| `RELAY_CONTRACT_RUNTIME_MAP.md` | **CURRENT** | Which contract lives in which module |
| `RELAY_CONTRACT_CHANGE_PROCESS.md` | **CURRENT** | How contracts may be changed |
| `RELAY_UI_SYSTEM_V2.md` | **CURRENT** | Design-system contract |
| `SENDER_ROUTING.md` | **CURRENT** | Sending-profile routing rules |
| `FOLLOWUP_POLICY_MAP.md` | **CURRENT** | Follow-up cadence authority map |
| `RELAY_PRODUCT_CONTRACTS.md` | **CURRENT** | Business-rule contracts |

## 3. Current product contracts (per surface)

| Doc | Class | What it is |
|---|---|---|
| `RELAY_NAVIGATION_V2.md` | **CURRENT** | Sales surface routes + replacements |
| `RELAY_SALES_WORKSPACE_V2.md` | **CURRENT** | Sales workspace |
| `RELAY_TASK_SYSTEM_V2.md` | **CURRENT** | Task engine |
| `RELAY_REP_HOME_V2.md` | **CURRENT** | Rep home contract (Phase 3) |
| `RELAY_MANAGER_HOME_V2.md` | **CURRENT** | Manager home (Phase 4) |
| `RELAY_OPERATIONS_WORKSPACE_V2.md` | **CURRENT** | Ops workspace (Phase 8) |
| `RELAY_ADMIN_COMMAND_CENTER_V2.md` | **CURRENT** | Admin command center (Phase 5) |
| `SCORING_ARCHITECTURE.md` | **CURRENT** | Scoring system design |
| `SCORING_INVARIANTS.md` | **CURRENT** | Scoring invariants |
| `SCORING_RELEASE_CHECKLIST.md` | **CURRENT** | Scoring release gate |
| `UPWORK_SCORING.md` | **CURRENT** | Upwork job scoring |
| `RELAY_PREVIEW_QA_POLICY.md` | **CURRENT** | Preview environment QA policy |

## 4. Database / infrastructure

| Doc | Class | What it is |
|---|---|---|
| `RELAY_PHASE8_DATABASE_CONTRACTS.md` | **CURRENT** | DB schema contracts |
| `RELAY_NEON_CUTOVER_FINAL.md` | **CURRENT** | Neon cutover — required env vars |
| `RELAY_NEON_AGGREGATE_SLICE.md` | **CURRENT** | Analytics SQL aggregates (egress) |
| `RELAY_NEON_ANALYTICS_EGRESS.md` | **CURRENT** | Analytics egress design |
| `RELAY_NEON_EGRESS_AUDIT.md` | **CURRENT** | Egress audit evidence |
| `RELAY_NEON_EGRESS_BUDGET.md` | **CURRENT** | Egress budget model |
| `RELAY_SUPABASE_APPLICATION_DEPENDENCY_MAP.md` | **CURRENT** | Rollback-path dependency map |
| `RELAY_SUPABASE_DEPENDENCY_MAP.md` | **HISTORICAL** | Superseded by the application map |
| `RELAY_MIGRATION_RECONCILIATION_2026-11.md` | **CURRENT** | Latest migration reconciliation |
| `RELAY_MIGRATION_VERIFICATION_2026-10-25.md` | **HISTORICAL** | Point-in-time verification |
| `RELAY_NEON_MIGRATION.md` / `RELAY_NEON_MIGRATION_FINAL.md` | **SUPERSEDED** | Superseded by `RELAY_NEON_CUTOVER_FINAL.md` |
| `RELAY_NEON_APPLICATION_CUTOVER.md` | **SUPERSEDED** | Superseded by `RELAY_NEON_CUTOVER_FINAL.md` |
| `RELAY_TENANT_TEST_2026-10-25.md` | **HISTORICAL** | RLS test evidence |
| `RELAY_PRODUCTION_TEST_DATA_CLEANUP.md` | **HISTORICAL** | Cleanup runbook (point-in-time) |

## 5. Current QA

| Doc | Class | What it is |
|---|---|---|
| `QA_END_TO_END.md` | **CURRENT** | End-to-end QA script |
| `RELAY_PRODUCTION_ACTIVATION_RUNBOOK.md` | **CURRENT** | Release runbook |
| `RELAY_QA_CLOSURE_LATEST.md` | **HISTORICAL** | 12-bug batch closure (root-cause pass) |
| `RELAY_QA_CLOSURE_REPORT.md` | **HISTORICAL** | Final QA closure report |
| `RELAY_BROWSER_ACCEPTANCE_FINDINGS.md` | **HISTORICAL** | Browser RC acceptance findings |

---

## 6. Historical / archive candidates

Point-in-time status, activation, and audit reports. Keep for context; move to
`docs/archive/` when the stabilization program reaches Phase 19 execution.

**Activation / status (dated):**
`RELAY_ACTIVATION_STATUS.md` · `RELAY_FINAL_ACTIVATION_STATUS.md` ·
`RELAY_PHASE8_FINAL_ACTIVATION.md` · `RELAY_PRODUCTION_CLOSURE_STATUS.md` ·
`RELAY_LEARNING_ACTIVATION_STATUS.md` · `RELAY_UX_ACTIVATION_STATUS.md` ·
`RELAY_FIRST100_CAMPAIGN_STATUS.md` · `RELAY_TRUST_PROGRAM_STATUS.md` ·
`RELAY_POST_MVP_PROGRAM_STATUS.md` · `RELAY_DAILY_OPERATIONS_RELEASE.md` ·
`RELAY_SPRINT_B_STATUS.md` · `RELAY_CLOSURE_2026-10-29.md`

**Autonomous OS / revenue engine program:**
`RELAY_AUTONOMOUS_OS_AUDIT.md` · `RELAY_AUTONOMOUS_OS_COMMAND_STATUS.md` ·
`RELAY_AUTONOMOUS_OS_FOUNDATION_STATUS.md` · `RELAY_AUTONOMOUS_OS_SOURCES_STATUS.md` ·
`RELAY_AUTONOMOUS_EMAIL_ENGINE_STATUS.md` · `RELAY_EFFECTIVE_SEND_POLICY_STATUS.md`

**Audits (point-in-time):**
`RELAY_AUDIT_2026-10-24.md` · `RELAY_E2E_AUDIT_2026-10-22.md` ·
`RELAY_E2E_TRUST_AUDIT_2026-10-29.md` · `RELAY_EXPLAINABILITY_AUDIT.md` ·
`RELAY_OBSERVABILITY_AUDIT.md` · `RELAY_DATA_VISIBILITY_FIX.md` ·
`RELAY_NAVIGATION_PERFORMANCE.md` · `RELAY_OPERATIONS_EGRESS_AUDIT.md` ·
`RELAY_SALES_QUERY_EGRESS_AUDIT.md` · `RELAY_SECURITY_ANON_EXPOSURE_AUDIT.md` ·
`RELAY_DEPLOYED_SHA_2026-10-25.md` · `RELAY_DEPLOYED_VERIFICATION_2026-10-25.md`

**Program / planning (completed):**
`RELAY_PRODUCT_SIMPLIFICATION_PLAN.md` · `SCORING_V4_PROGRAM.md` ·
`RELAY_BUG_23_31_CLOSURE.md`

**Security / privacy:**
`PII_GIT_REMEDIATION.md`

**Reference data:**
`GOLDEN_SET.md` · `RAW_TEXT_READER_INVENTORY.md`

---

## 7. Gaps

- No `docs/archive/` yet — historical docs still sit in `docs/`.
- `RELAY_NEON_CUTOVER_FINAL.md` is the only doc that records the required production
  env vars; it should be linked from `RELAY_PRODUCTION_ACTIVATION_RUNBOOK.md`.
