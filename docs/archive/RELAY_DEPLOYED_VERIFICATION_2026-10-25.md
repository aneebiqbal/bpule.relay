# Relay — Deployed-SHA Verification (2026-10-25)

**PR #31 merged** → merge commit `617dc56` → deployed and confirmed by `/api/version`.
**PR #32 merged** (the LOW-band "Weak fix" follow-up) → merge commit **`65b9f91`** → deployed and confirmed.

`/api/version` returns `sha: 65b9f916ff1198278e9eaaff7a8f19ef051ddcaf`, ref `main`, deployment `dpl_…`, scoring `relay_decision_v3.3.0`, buyer-intent `buyer_intent_v5`. **Deployed SHA == intended release.**

---

## 1. Deployed bundle (production JS, 26 chunks / 1.77 MB)

| String | Count | Meaning |
|---|---|---|
| `"Reach out to connect"` | **0** | old action string gone |
| `"Weak fit"` | **0** | LOW-band mislabel gone |
| `"Not a fit"` | 2 | canonical SKIP label |
| `"Low priority"` | 2 | canonical LOW label |
| `"To Contact"` | 1 | pipeline stage |
| `observe` | 5 | new OBSERVE stage |

## 2. Real production data through the deployed code path

| Case | Verdict |
|---|---|
| **Jurica** (ROKO Labs, `verdict=skip`) | `action=REVIEW`, `"Not a fit — do not contact"`, `requiresAction=false`, `pipelineStage=observe` ✅ |
| **Explicit buyer** (`verdict=send`, status new) | `action=SEND_CONNECTION`, `"Send connection request"`, `requiresAction=true`, `pipelineStage=to_contact` ✅ — no overcorrection |
| **Lead with real inbound** | `action=SEND_FOLLOWUP`, inbound present ✅ |
| **Decision trace** | `EPISODES_BUILT→buyerIntent`, `SCORE→composite` ✅ |

## 3. Abdulhakim

Stored packet: `buyerIntentLevel=UNKNOWN`, `verifiedBuyerRequest=false`, `verdict=research_more` → **OBSERVE**, no outreach action ✅.
Caveats: his lead `status=won` (terminal → `CLOSED`), and `relationshipRole=BUILDER` (not `SERVICE_PROVIDER`) — a pre-existing classification, untouched per instruction.

## 4. Thread state

`deriveThreadStatus([]) === 'NO_THREAD'` (unit-verified). The UI strings live in lazy chunks not enumerable from the page HTML.

## 5. Tests

- `tsc --noEmit`: clean.
- New regression suite: 13 pass.
- Targeted suites: 37 pass.
- Full suite: 3,410 pass / 6 fail (the same 6 pre-existing `hardening-regression` failures; no new failures).
- `pnpm build`: exit 0.

## 6. Not verifiable from here

Lazy-loaded page chunks (`NO_THREAD`, `They replied`, `Watch — not yet a fit`) are not enumerable from the served HTML; they are covered by unit tests and the data-layer verification above.

---

## Verdict

**Deployed SHA verified. Action/state contract fixed in code and confirmed against real production data.**
**Remaining: a human browser pass on the deployed SHA to close the defect family.**
