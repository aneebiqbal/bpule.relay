# Relay Product Contracts

Decisions that a future change must not silently reverse. Each entry names the
decision, why it was made, and the evidence that settled it. If you believe a
contract is wrong, change the contract (and its tests) deliberately — do not
"fix" the code underneath it.

---

## 1. Title and employer must remain separate

**Contract.** `person.title` is the role only. The employer is its own field
(`company.name`). The two are never merged in extraction; the display layer
renders them as `Role · Company` and deduplicates when a stored title already
carries the employer.

**Why.** One field per concept. A title of `"CEO at Hartford AI Partners"` puts
the employer in two places, so the company can be shown twice or drift from the
extracted company. Separating them makes the subtitle a pure function of two
facts.

**Evidence.**
- `separateRoleFromEmployer` (`src/lib/intelligence-v2/extraction-pipeline.ts`)
  splits `"Role at Company"` into role + employer.
- `tests/prospect-qa-module-01.test.ts` — `PRO-002: role and employer are
  separated`, added in `56ff43d`.
- `formatRoleLine` (`src/lib/leads/role-line.ts`) still tolerates a title that
  already contains the employer, for already-saved titles.

**Do not reverse.** `tests/hardening-regression-brian` and `-elijah` asserted
that the title *contains* the company. Those assertions predate this contract
and contradict it; they were corrected in `bdf75f8`, not the code.

---

## 2. A "high-potential builder" must have a product or technical signal

**Contract.** The builder connection-note path
(`isHighPotentialBuilder` in `src/lib/relay/revenue-strategy.ts`) requires a
product business model (`businessModel === 'PRODUCT'`) or technical signals
(`technicalSignals.length > 0`). A Founder/CEO title alone is not enough.

**Why.** The rule's name is *high potential builder* — someone building a
product BPulse could sell into. An interior designer, a nonprofit COO, or any
other non-software CEO is not a BPulse-relevant builder, and must not be sent
outreach on the strength of a title alone.

**Evidence.**
- `tests/revenue-strategy-builder-connection.test.ts` — 5 cases, all using
  `businessModel: 'PRODUCT'`.
- `tests/hardening-regression-avigail.test.ts` — the counterweight: Avigail
  Eisenstadt is a CEO/Founder with `businessModel: 'UNKNOWN'`,
  `technicalRelevance: 'NONE'`, `productMomentum: 'NONE'`; the hardening fixture
  requires no message.

**Do not reverse.** `isHighPotentialBuilder` was introduced in `11f55cf` with a
title-only test; `bdf75f8` narrowed it to product/technical builders after the
avigail fixture caught a non-software CEO receiving a connection note.

---

## Related

- Build identity: `GET /api/version` (`sha`, `ref`, `deploymentId`, `env`,
  `appVersion`). Compare the deployed SHA with the tested SHA before sign-off.
- Cross-surface parity: `src/lib/relay/lead-parity.ts` — one lead, one canonical
  state, divergences reported.
