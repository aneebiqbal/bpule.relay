# Relay Interaction QA Matrix (In Progress)

This matrix currently covers the P0 hardening scope completed in this pass.

| Route | Control | Visible To | Expected Action | Actual Action | API Called | Expected DB Change | Actual DB Change | Success Feedback | Error Feedback | Refresh Persistence | Authorization | Mobile | Status |
|-------|---------|------------|-----------------|---------------|------------|--------------------|------------------|------------------|----------------|---------------------|---------------|--------|--------|
| `/prospect` | Analyze | Auth user | Analyze pasted prospect | Works; returns score only if eligible | `POST /api/prospect/analyze` | None (ephemeral) | None | Recommendation + evidence | Alert with reason | N/A | Scoped by session | Not fully retested | ✅ Fixed |
| `/prospect` | Analyze garbage input | Auth user | Reject insufficient context | Works; returns NOT ENOUGH INFORMATION state | `POST /api/prospect/analyze` | None | None | Ineligible state + metrics | Validation + reasons | N/A | Scoped by session | Not fully retested | ✅ Fixed |
| `/prospect` | Create lead | Auth user | Persist lead once | Works; gated by eligibility and duplicate policy | `POST /api/prospect/save` | Lead row + score + optional draft | Verified in tests/demo smoke | Navigate to lead page | Structured API error | Lead route survives refresh (smoke) | Scoped by store ownership | Not fully retested | ✅ Fixed |
| `/prospect` | Create lead duplicate | Auth user | Show existing lead + options | Works; shows existing lead and optional create separate | `POST /api/prospect/save` | No duplicate unless override | Verified in tests | Alert with actions | Structured 409 with metadata | Existing lead opens after refresh | Scoped by store ownership | Not fully retested | ✅ Fixed |
| `/prospect` | Copy note | Auth user | Copy current note | Works; disabled when no eligible note | None | None | None | Copied state | Browser clipboard failure silent | N/A | N/A | Not fully retested | ✅ Fixed |
| `/leads/new` | Extract | Auth user | Extract fields from raw input | Works; extraction fills form | `POST /api/leads/extract` | None | None | Form populated | Alert error | N/A | Scoped by session | Not fully retested | ✅ Verified |
| `/leads/new` | Save lead (eligible) | Auth user | Persist lead | Works | `POST /api/leads` | Lead row + score | Verified in tests | Redirect to lead | Structured error | Persists by lead route | Scoped by store ownership | Not fully retested | ✅ Fixed |
| `/leads/new` | Save lead (insufficient) | Auth user | Prevent save | Works; blocked client + server | `POST /api/leads` | None | None | Button disabled + blocked message | 422 with details | N/A | Scoped by session | Not fully retested | ✅ Fixed |
| `/leads/new` | Save lead duplicate | Auth user | Offer resolve path | Works; view existing + create separate for potential duplicate | `POST /api/leads` | No duplicate unless override | Verified in tests | Duplicate alert + actions | Structured 409 | Existing lead URL stable | Scoped by store ownership | Not fully retested | ✅ Fixed |

Remaining routes still need route-by-route control inventory and browser verification.
