# Studio Release Gate

## Pre-Flight (already verified)

- [x] TypeScript: `npx tsc --noEmit` passes
- [x] Tests: 441/441 pass
- [x] Build: `npm run build` succeeds
- [x] Lint: No new errors introduced

## Browser E2E (requires deployed environment)

- [ ] **Full journey**: Login → Create Persona → Onboarding → Today's Pick → Write This → Post Workspace → Save → Return
- [ ] **No empty Studio**: Today always shows ideas for new personas
- [ ] **Draft persistence**: Generated draft survives refresh in post workspace
- [ ] **Multi-persona isolation**: Two personas show different ideas, no data leakage
- [ ] **Returning user**: Ideas differ from previous session, Taste affects ranking
- [ ] **Quick Capture**: Input → angles → generation works
- [ ] **Identity page**: Shows confirmed onboarding data, editable
- [ ] **Journey page**: Shows timeline from imported experiences

## Writing Quality (live benchmark: 40 posts)

- [ ] **≥85% Would Post / Needs Light Edit**
- [ ] **0 fabricated personal claims**
- [ ] **Sparse vs rich personas produce materially different content**
- [ ] **Non-technical roles (founder, designer, BD) produce credible posts**
- [ ] **X posts are compositionally distinct from LinkedIn**
- [ ] **No keyword stuffing or repetitive patterns**

## Routing & Latency (from actual generations)

- [ ] **LongCat first-pass acceptance rate measured**
- [ ] **Groq corrective retry rate measured**
- [ ] **GPT escalation rate < 5%**
- [ ] **Average generation latency < 30s**
- [ ] **No generation silently fails**

## Mobile

- [ ] **Onboarding usable at 390px**
- [ ] **Today page readable at 390px**
- [ ] **Post workspace editor functional at 390px**
- [ ] **No horizontal overflow on any screen**

## Security & Data

- [ ] **Persona A cannot read Persona B**
- [ ] **Organization isolation enforced**
- [ ] **Logout/login preserves all data**
- [ ] **Onboarding progress survives refresh**

## Run Command

```bash
# Deploy first, then:
ENDPOINT=https://your-deployment.vercel.app PERSONA_IDS=id1,id2,... node scripts/benchmark-studio.mjs
```

## Acceptance

All gates pass → `STUDIO REBUILD READY`
Any gate fails → `NOT READY — <specific failures>`
