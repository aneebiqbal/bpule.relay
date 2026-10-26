# Relay Contract Change Process

**Release-gating artifact.** A product contract is a decision, not an
implementation detail. Changing one is a deliberate act with a paper trail.

> **No silent behavior changes.** A contract is changed by changing the contract
> document and every dependent test in the same change.

---

## When this process applies

Any change to a decision recorded in `docs/RELAY_PRODUCT_CONTRACTS.md`:

- redefining what a field means (title vs employer, score vs activity points)
- changing who may be contacted (builder, buyer, terminal)
- changing what "unknown" renders as
- changing what persists across a refresh
- changing which state is canonical for a surface

A refactor that preserves behavior does **not** need this process.

---

## Required content of the change

1. **Contract rationale** — why the old decision is wrong, with the evidence
   (a QA report, a production trace, a named fixture). "Feels better" is not a
   rationale.
2. **Affected tests** — every test that encodes the old decision, updated in the
   same change. A contract change that leaves a dependent test asserting the old
   behavior is incomplete.
3. **Affected consumers** — every runtime consumer of the canonical owner, from
   `docs/RELAY_CONTRACT_RUNTIME_MAP.md`. A consumer that re-derives the value
   must be pointed at the owner.
4. **Migration, if any** — persisted data or stored state that means something
   different now. If none, say so explicitly.
5. **Release notes** — one or two lines a human can read, naming the behavior
   change.

---

## The rule that prevents regression loops

> **If a test conflicts with a documented product contract, investigate the test
> first. If the product contract itself is wrong, change the contract
> deliberately and update all dependent tests together.**

A test that contradicts a contract is almost always a stale test. Silently
editing the test to make it pass, or silently changing the code to satisfy the
test, both reintroduce the regression the contract exists to prevent.

---

## Checklist

- [ ] `docs/RELAY_PRODUCT_CONTRACTS.md` updated, with the decision and the why
- [ ] `docs/RELAY_CONTRACT_RUNTIME_MAP.md` updated (owner / consumers / tests)
- [ ] Every dependent test updated in the same change
- [ ] `pnpm qa:coverage` passes with **zero skipped** contract tests
- [ ] `tests/relay-regression-corpus.test.ts` still passes (or a fixture's
      expectation is updated with its rationale)
- [ ] `tests/relay-contract-owners.test.ts` still passes (no owner orphaned)
- [ ] Migration section filled in, or explicitly marked "none"
- [ ] Release notes written
