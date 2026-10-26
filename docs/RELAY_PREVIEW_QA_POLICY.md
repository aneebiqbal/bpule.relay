# Relay Preview QA Policy

**Release-gating artifact.** How browser QA may run against a Relay preview, and
what must never be done for convenience.

---

## Why preview protection matters

A Relay preview can contain real internal functionality and can be connected to
real data. Preview environments are, by default, publicly reachable by URL. That
is acceptable for a throwaway deploy **only** while the URL is unguessable and
the environment is protected.

**Do not weaken preview protection for QA convenience.** A QA pass is not a
reason to make an environment public.

---

## Rules

1. **Use Vercel's deployment protection for preview deployments.** Enable the
   project's appropriate protection mode (Authentication, or a secret
   Authorization header) for previews. Verify it is on before running QA.
2. **Never deploy production credentials to a preview.** A preview uses its own
   environment. If a QA pass needs a database, use a dedicated preview/staging
   project — never the production project.
3. **Never run destructive tests against a preview that shares production data.**
   Write, delete, and tenant-isolation tests belong on an isolated environment.
4. **Record the exact SHA under test.** `GET /api/version` must report the SHA
   that QA is exercising. Use `pnpm qa:deployed --url=<preview> --sha=<expected>`
   and fail the pass on mismatch. No browser acceptance against an unidentified
   build.
5. **Do not claim browser verification you did not run.** If credentials or an
   environment are unavailable, the report says so — with the exact blocker.

---

## QA sequence on a preview

1. Deploy the exact commit under test as a preview.
2. `pnpm qa:deployed --url=<preview> --sha=<commit>` — must PASS.
3. Confirm preview protection is enabled.
4. Run the browser acceptance matrix (Nadia, Hannah, Emma, Ethan, Daniel,
   Jurica, Abdulhakim, explicit buyer, inbound-first, no-thread).
5. Run mobile (375×812) and accessibility checks.
6. Record the SHA, the cases run, and any case not run with its reason.

---

## Production

Production promotion is a separate, explicit step. It is never part of a QA
pass, and it never happens on a SHA that has not passed the preview gate.
