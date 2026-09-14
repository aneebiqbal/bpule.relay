# Relay Studio 2.0 — Manual QA Checklist

## Setup

```bash
# 1. Seed dev data (requires Supabase env vars)
SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... node scripts/seed-studio-personas.mjs

# 2. Start dev server
npm run dev

# 3. Log in as a dev user (e.g. aneeb@scout.dev / scout-dev-password)
```

---

## 1. Radar Quality

For each persona, open Studio and verify:

- [ ] **Sarah (Full-Stack)**: Radar shows opportunities about PostgreSQL, Rails architecture, system design. NOT generic "share your thoughts on AI".
- [ ] **Marcus (DevOps)**: Radar surfaces CI/CD, Kubernetes, infrastructure topics. Build-time reduction story appears.
- [ ] **Priya (ML)**: Radar shows LLM evaluation, RAG, prompt engineering. Hallucination story appears.
- [ ] **Jake (FDE)**: Radar shows AI agent reliability, customer implementation. Compliance story appears.
- [ ] **Aisha (Frontend)**: Radar shows design systems, performance, accessibility. Screen reader story appears.
- [ ] **David (Manager)**: Radar shows leadership, hiring, team structure. IC-to-manager story appears.

**Diversity check**: Each persona should see 3-5 distinct opportunity types, not the same archetype repeated.

**Honesty check**: No opportunity claims "you worked on X Tuesday" unless the data actually contains that timing.

---

## 2. Opportunity Diversity

- [ ] Select a "behind_the_build" opportunity → should describe a real project from DNA
- [ ] Select a "mistake_or_failure" opportunity → should reference a real experience
- [ ] Select a "contrarian_position" opportunity → should reference a real opinion
- [ ] No two opportunities should be the same idea with different wording

---

## 3. Interview Quality

For Sarah, use input: "I spent yesterday debugging a query that was doing 4,000 index scans per request."

- [ ] **Q1**: Asks about the specific query/index, NOT "tell me more about your work"
- [ ] **Q2** (if asked): Follows up on the answer, NOT a generic repeat
- [ ] **Stops after 1-3 questions** — does not keep asking indefinitely
- [ ] **Skips interview entirely** when given rich input like: "I spent three hours yesterday debugging a race condition in our CI pipeline. Turns out two tests were sharing mutable state because the setup block was not using transactions."

**Adaptive check**: Give vague input ("deployment stuff") → should ask for specifics. Give detailed input → should skip or ask only 1 follow-up.

---

## 4. Voice Personalization

Generate the same topic for three personas: "A technical decision you made recently"

- [ ] **Sarah**: Sounds like a senior engineer — measured, references specific technologies
- [ ] **Marcus**: Shorter sentences, direct, references infrastructure specifics
- [ ] **David**: More reflective, references team/org impact

**Swap test**: If you can swap the author names without noticing, voice conditioning is too weak.

---

## 5. Generation Quality

For each of these inputs, verify the output is specific and credible:

| Input | Expected |
|-------|----------|
| "I debugged a deployment because of stale env vars" | Mentions env vars, deployment, the fix |
| "Our CI went from 18 min to 4 min" | Mentions caching, parallelization, build times |
| "Our RAG bot quoted 2022 pricing" | Mentions stale data, retrieval, freshness checks |
| "I promoted my best IC to manager" | Mentions the mistake, the lesson, career paths |
| "Our modal re-renders 40 times on open" | Mentions context, memoization, re-renders |

**Anti-slop check**: Output should NOT contain:
- "Here are 5 lessons..."
- "Nobody talks about this"
- "Let that sink in"
- "Thoughts?" or "Agree?"
- "In today's rapidly evolving..."

---

## 6. LinkedIn vs X

Generate the same idea for both platforms:

- [ ] **LinkedIn**: Longer, professional tone, story structure, useful takeaway
- [ ] **X**: Shorter, sharper observation, conversational, no Unicode formatting
- [ ] **NOT** just truncation — the composition should be genuinely different

---

## 7. Duplicate Prevention

- [ ] Generate a post about "debugging stale environment variables"
- [ ] Try to generate the SAME topic again
- [ ] System should warn about similarity or suggest a different angle
- [ ] Radar should NOT surface the same opportunity again after it is covered

---

## 8. Rejection Learning

- [ ] Generate a post → click "Not for me"
- [ ] Check that feedback is recorded (content_draft_feedback table)
- [ ] Generate again → the rejected angle should be less likely to return
- [ ] But the system should NOT stop generating entirely (no overfitting from 1 rejection)

---

## 9. Regeneration

- [ ] Generate a post → click "Regenerate"
- [ ] Should produce a DIFFERENT version (different angle or wording)
- [ ] Should NOT return the exact same text
- [ ] Should NOT reset to the Radar screen

---

## 10. Cross-Session Learning

**Session 1**:
- [ ] Generate a post about "debugging stale environment variables"
- [ ] Click "Posting this"
- [ ] Note the DNA confidence score

**Session 2** (refresh page):
- [ ] Open the same persona
- [ ] Radar should NOT suggest the same deployment story
- [ ] Content DNA should show the new experience in the profile
- [ ] If you give a related input, the system should reference what it learned

---

## 11. Organization Differentiation

If multiple personas are in the same org:

- [ ] Open `/api/content/intelligence/org-themes` (or check the org themes endpoint)
- [ ] Shared themes should appear (e.g., "AI" for Priya and Jake)
- [ ] Each persona should get a DIFFERENTIATED angle on the shared theme
- [ ] No persona's private DNA should leak to another

---

## 12. Edge Cases

- [ ] **Empty input**: System should refuse to generate (sourceMaterial required)
- [ ] **Very long input**: Should handle gracefully (truncate or process)
- [ ] **Special characters**: Should not break the pipeline
- [ ] **No model provider**: Should fall back gracefully (demo mode)
- [ ] **Daily cap**: After 2 generations, should show the cap message

---

## Persona Quick Reference

| Persona | Role | Voice | Key Topics |
|---------|------|-------|------------|
| Sarah Chen | Senior Full-Stack | Dry, measured | Rails, Postgres, system design |
| Marcus Rivera | DevOps | Direct, sarcastic | CI/CD, K8s, infrastructure |
| Priya Sharma | ML Engineer | Curious, precise | LLM eval, RAG, inference |
| Jake Morrison | FDE | Conversational, warm | AI agents, customer integrations |
| Aisha Patel | Frontend | Warm, precise | Design systems, performance, a11y |
| David Park | Eng Manager | Thoughtful, direct | Leadership, hiring, architecture |

---

## Recent-Work Inputs for Testing

### Sarah (Full-Stack)
1. "I spent yesterday debugging a query that was doing 4,000 index scans per request. The fix was a composite index we should have added a year ago."
2. "We had to roll back a deploy because a migration locked the users table for 90 seconds."

### Marcus (DevOps)
1. "A Kubernetes node ran out of memory and took down three unrelated services because we had no resource limits set."
2. "We had a deploy fail because a Docker image layer cache was stale. The image had a CVE from three months ago."

### Priya (ML)
1. "We switched from cosine similarity to hybrid retrieval (BM25 + vector) and our hallucination rate dropped by half."
2. "I found that our eval framework was gaming itself — the LLM judge favored longer responses regardless of quality."

### Jake (FDE)
1. "A customer asked our agent to process PII in a way that violated their own data policy."
2. "We found that customers trust the agent more when it says 'I am not sure about this one' instead of guessing."

### Aisha (Frontend)
1. "I found that our modal component was re-rendering 40 times on open because of a context provider that was not memoized."
2. "We had a customer complain that our checkout flow was unusable with a screen reader."

### David (Manager)
1. "We had to make a call between shipping the Q3 feature on time or delaying to fix a critical security vulnerability."
2. "I have been thinking about the difference between a team that is busy and a team that is effective."
