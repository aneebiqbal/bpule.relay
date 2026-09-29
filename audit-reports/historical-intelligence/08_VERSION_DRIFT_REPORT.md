# 08 — VERSION DRIFT REPORT

## Historical Context

All production data was generated in **September 2026** (Sept 16-29).
There is no historical version drift to analyze — all records were created
within a 14-day window under the same pipeline versions.

## Pipeline Versions in Use

| Component | Version | Applied |
|-----------|---------|---------|
| Runtime | runtime-v3 | All records |
| Score | relay_qualification_v2 | All scored records |
| Intelligence Pipeline | intelligence_pipeline_v1 | All records |
| App | 0.8.0 | All records |

## Message Model Timeline

| Model | Usage Period | Count |
|-------|-------------|-------|
| seed | Sept 16 (initial) | 2 |
| tier4:openai | Sept 16-29 | 61 |
| tier1:groq | Sept 16-29 | 40 |
| opencode (tier1) | Sept 16-29 | 174 |
| prospect-check | Sept 16-29 | 70 |
| null | Sept 16 (initial batch) | 190 |

## Drift Analysis: NOT APPLICABLE

Since all data was generated in a single month under the same pipeline:
- No version comparison possible
- No quality improvement over time detectable
- No historical quality debt from older pipelines

## Future Version Tracking Recommendation

The following tables/fields should be populated for future audits:
- **ai_traces**: Currently empty. Should capture every AI call with model, provider, prompt_version, runtime_version
- **relay_runs**: Currently empty. Should track orchestration workflow
- **golden_set**: Should be populated for eval regression testing
- **eval_runs**: Should track automated eval results over time

## Historical Debt Assessment

| Category | Records | Action Needed |
|----------|---------|---------------|
| Records with scoring dim artifacts in evidence | 190 leads + 746 prospects | REPROCESS: Extract real evidence from scoring dimensions |
| Competitor leads not reclassified | 57 leads | RECLASSIFY: Mark as competitors |
| Messages targeting competitors | 220 messages | REGENERATE or DELETE |
| Legacy scored leads (no canonical) | 100 leads | RESCORE: Process through current pipeline |
| Seed/template messages | 72 messages | REGENERATE with real AI |

