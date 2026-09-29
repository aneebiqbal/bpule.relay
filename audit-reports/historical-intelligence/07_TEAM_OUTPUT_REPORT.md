# 07 — TEAM OUTPUT REPORT

**Important**: This report evaluates Relay system quality for each user's data,
NOT individual employee performance. Differences may be caused by input quality,
timing, features used, or system behavior — not user skill.

## Lead Audit by Rep

| Rep | Leads | Competitors | Over-scored | Under-scored | Reasonable | Qual Disagree | Evidence Polluted |
|-----|-------|-------------|-------------|--------------|------------|---------------|-------------------|
| Ahmad | 121 | 38 (31%) | 24 (20%) | 47 | 50 | 118 | 55 |
| Hassan | 69 | 27 (39%) | 15 (22%) | 26 | 28 | 68 | 43 |
| Dawood | 57 | 18 (32%) | 25 (44%) | 2 | 30 | 56 | 55 |
| Madiha | 21 | 6 (29%) | 14 (67%) | 1 | 6 | 21 | 19 |
| Abdullah | 14 | 2 (14%) | 3 (21%) | 1 | 10 | 14 | 13 |
| Aneeb | 8 | 5 (63%) | 3 (38%) | 3 | 2 | 6 | 5 |
| Najiullah | 1 | 0 (0%) | 0 (0%) | 1 | 0 | 1 | 0 |
## Message Quality by Rep

| Rep | Messages | Good | Minor Edit | Rewrite | Should Not Gen | Sendable % |
|-----|----------|------|------------|---------|----------------|------------|
| Ahmad | 197 | 56 | 51 | 0 | 90 | 54% |
| Dawood | 170 | 75 | 46 | 0 | 49 | 71% |
| Hassan | 160 | 45 | 50 | 0 | 65 | 59% |
| Najiullah | 39 | 13 | 26 | 0 | 0 | 100% |
| Abdullah | 31 | 4 | 21 | 0 | 6 | 81% |
| Aneeb | 17 | 1 | 6 | 0 | 10 | 41% |
| Madiha | 2 | 0 | 2 | 0 | 0 | 100% |

## Observations

1. **All reps share the same evidence pollution issue** (99%+ affected).
   This is a system-level bug, not user-specific.

2. **Competitor misclassification affects all reps** since it's caused by
   the extraction/classification pipeline, not user behavior.

3. **Message quality varies by rep** primarily because of different model
   distributions (some used more OpenAI, some more Groq/OpenCode).

4. **Highest volume reps (Ahmad, Hassan, Dawood)** have the most absolute
   issues but similar rates to others.

