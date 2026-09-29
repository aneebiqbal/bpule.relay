# 01 — DATASET SUMMARY

## Production Data Inventory

| Table | Count |
|-------|-------|
| organizations | 4 |
| reps | 11 |
| profiles | 14 |
| leads | 291 |
| captured_prospects | 753 |
| upwork_jobs | 43 |
| messages | 616 |
| upwork_messages | 21 |
| conversation_states | 158 |
| relay_events | 2108 |
| relay_runs | 0 |
| ai_traces | 0 |
| outcomes | 9 |
| revenue_identities | 9 |
| prepared_email_drafts | 8 |
| golden_set | 0 |
| eval_runs | 0 |
| edit_learning | 186 |
| sales_memory | 216 |
| proof_cards | 4 |

## Organizations

| ID | Name | Plan |
|----|------|------|
| 11111111-... | bpulse | active |
| 350fd290-... | Muhammad Mazar | trial |
| d31d2189-... | Relay Beta | trial |
| 5fc192af-... | anum | trial |

**All 291 leads belong to bpulse (11111111-...)**

## Team Members (Reps)

| Name | Role | Leads Owned |
|------|------|-------------|
| Ahmad | rep | 121 |
| Hassan | admin | 69 |
| Dawood | rep | 57 |
| Madiha | rep | 21 |
| Abdullah | rep | 14 |
| Aneeb | admin | 8 |
| Najiullah | rep | 1 |
| Suhiab | rep | 0 |
| mazarkhosa518 | admin | 0 (different org) |
| Anum | admin | 0 (different org) |
| itsanalink28 | admin | 0 (different org) |

## Data Completeness

| Metric | Count | Percentage |
|--------|-------|------------|
| Total leads | 291 | 100% |
| With canonical intelligence | 191 | 65.6% |
| With legacy score only | 100 | 34.4% |
| With canonical score | 191 | 65.6% |
| With evidence ledger | 191 | 65.6% |
| With raw source on leads table | 0 | 0% |
| With raw source in intel blob | 289 | 99.3% |
| With extraction profile | 289 | 99.3% |

## Score Distribution

### Canonical Scores (191 leads)
| Band | Count | Percentage |
|------|-------|------------|
| 0-20 | 2 | 1.0% |
| 21-40 | 5 | 2.6% |
| 41-60 | 16 | 8.4% |
| 61-80 | 109 | 57.1% |
| 81-100 | 59 | 30.9% |

### Legacy Scores (291 leads)
| Band | Count | Percentage |
|------|-------|------------|
| 0-3 | 0 | 0% |
| 4-6 | 14 | 4.8% |
| 7-9 | 60 | 20.6% |
| 10-12 | 217 | 74.6% |

## Message Distribution

| Type | Count |
|------|-------|
| connection | 408 |
| dm | 184 |
| reply | 20 |
| followup | 4 |

### Message Models
| Model | Count |
|-------|-------|
| null (legacy/seed) | 190 |
| opencode (tier1) | 174 |
| tier1:groq | 40 |
| tier4:openai | 61 |
| prospect-check | 70 |
| seed | 2 |
| tier1:groq-2 | 23 |
| cache | 10 |
| mixed/other | 22 |

### Send Dispositions
| Disposition | Count |
|-------------|-------|
| null (never sent/reviewed) | 460 |
| SENT_UNCHANGED | 132 |
| HEAVY_EDIT | 12 |
| LIGHT_EDIT | 12 |
| REJECTED | 0 |

## Conversation States

| Stage | Count |
|-------|-------|
| contacted | 153 |
| replied | 4 |
| lost | 1 |

## Temporal Distribution

**All leads created in September 2026** (2026-09-16 to 2026-09-29)
**All messages created in September 2026**

## Version Information

| Component | Version |
|-----------|---------|
| App | 0.8.0 |
| Runtime | runtime-v3 |
| Score | relay_qualification_v2 |
| Intelligence Pipeline | intelligence_pipeline_v1 |

## Critical Data Gaps

1. **No ai_traces** — telemetry table exists but empty
2. **No relay_runs** — orchestration table exists but empty
3. **No golden_set** — eval infrastructure not populated
4. **No eval_runs** — no automated eval history
5. **Only 9 outcomes** — insufficient for outcome correlation
6. **Single organization** — no multi-org comparison possible
7. **Single month** — no historical drift analysis possible
8. **No raw source on leads table** — raw_input exists only in intel JSON blob
9. **Evidence ledger polluted** — 99.1% contain scoring dimension artifacts
