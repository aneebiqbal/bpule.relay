# Relay Intelligence Benchmark

An independent evaluation harness for Relay's intelligence pipeline.

**This is the judge, not the contestant.**

## Purpose

Prove whether a new intelligence system is actually better at recognizing opportunities bpulse can win — or whether we just rewrote the code.

## Quick Start

```bash
# Run benchmark with mock pipeline (no AI calls, tests the harness)
pnpm intelligence:benchmark:mock

# Run benchmark with real production pipeline
pnpm intelligence:benchmark

# Run with specific options
node scripts/benchmark-intelligence.mjs --pipeline=baseline --cases=won-001,won-002
node scripts/benchmark-intelligence.mjs --mock --pipeline=candidate
node scripts/benchmark-intelligence.mjs --compare=benchmark-results/benchmark-baseline-xxx.json
```

## Output

- **Console**: Human-readable case-by-case results + summary
- **JSON**: Timestamped results saved to `benchmark-results/` for comparison
- **Exit code**: 0 if all cases pass, 1 if any invariant fails

## Files

| File | Purpose |
|------|---------|
| `scripts/benchmark-intelligence.mjs` | Main CLI entry point |
| `scripts/lib/benchmark/golden-dataset.json` | 36 golden cases from real bpulse history |
| `scripts/lib/benchmark/torture-tests.json` | 10 messy input torture tests |
| `scripts/lib/benchmark/evaluator.mjs` | Core evaluation + invariant checks |
| `scripts/lib/benchmark/outreach-eval.mjs` | Outreach quality + message similarity |
| `scripts/lib/benchmark/report.mjs` | Report generation + JSON export |
| `KNOWN-WIN-ANALYSIS.md` | Analysis of 20 real wins — why they were underrated |
| `DISCOVERED-FAILURES.md` | 10 production failures discovered (NOT fixed here) |
| `REMOTE-MATRIX.md` | Remote eligibility test cases for Pakistan-based ops |

## Golden Dataset

36 cases from real bpulse business history:
- **20 WON**: Clients actually closed (evidenced by contracts/proof items)
- **7 STRONG**: Opportunities with strong signal patterns
- **5 BAD**: Prospects that should be skipped
- **4 INELIGIBLE**: Remote-restricted opportunities

Cases span: LinkedIn profiles, Upwork jobs, various geographies, explicit/implicit signals.

## Automatic Invariants

The benchmark automatically FAILS when:
- Source URL is lost during extraction
- Supplied company/person name is lost
- A fact is fabricated (invented revenue, team size, etc.)
- Worldwide remote marked ineligible because company is abroad
- Explicit US-only remote marked as worldwide
- On-site/hybrid treated as normal remote
- Score changes merely because of surface representation
- Malformed output produced

## Before / After Comparison

```bash
# 1. Run baseline (current production pipeline)
node scripts/benchmark-intelligence.mjs --pipeline=baseline

# 2. Run candidate (new Intelligence V2 pipeline)
node scripts/benchmark-intelligence.mjs --pipeline=candidate

# 3. Compare them
node scripts/benchmark-intelligence.mjs --pipeline=candidate --compare=benchmark-results/benchmark-baseline-xxx.json
```

## Evaluating Intelligence V2 After Merge

When the other agent finishes, run:

```bash
pnpm intelligence:benchmark --pipeline=v2 --compare=benchmark-results/benchmark-baseline-latest.json
```

This will answer: **Is Relay actually better at recognizing opportunities we can win?**

## Principles

1. **No hardcoded expected scores**: We test reasoning, not teach answers
2. **Outcomes are evidenced**: Every WON case has a contract or proof item in the repo
3. **Company location ≠ worker eligibility**: We operate from Pakistan, pursuing international remote work
4. **Build the judge, not the contestant**: Document failures, don't fix production code

## Success Criteria

When the benchmark runs against Intelligence V2:
- Known wins should be recognized as strong opportunities (not necessarily scored 100)
- Remote eligibility should be correctly determined for all 10 remote test cases
- No fabrications should be introduced
- No source URLs should be lost
- Outreach should reference actual opportunity signals

The question is NOT "did the score go up?" but "is Relay better at recognizing what matters?"
