# Relay — Bug Sheet (plain English)

The five bugs from the November 17 report, what actually caused them, what you
see now, and how to check each one yourself. No jargon, no code.

**Everything below is fixed and checked.** Two of the fixes were found by
actually clicking through the app in a browser, not by reading code.

---

## BUG-38 — "It analyzes the prospect as Mehak no matter who I pick"

**What was wrong.** The analyzer used to pick the profile you selected, but if
that profile wasn't in its internal list at that moment, it quietly fell back to
the first profile in the list — which for your team was Mehak. So you'd select
Aneeb and get Mehak's skills and proof.

**What you see now.** The page says **"Prospecting as Aneeb, LinkedIn"** and the
analysis, the proof and the suggested next step all use Aneeb. If a profile
genuinely isn't available to you, it says so instead of silently using someone
else.

**How to check it yourself.**
1. Sign in, open **Sales → Prospects**.
2. In **Working as**, pick a profile that isn't the first one in the list.
3. Paste a LinkedIn profile, press **Analyze**.
4. The line at the top must name the profile you picked, and the result must
   match that person's skills.

**Extra thing we found while clicking.** The page used to default to whatever
account was active in the sidebar. If that was an Upwork account, the page
claimed "Prospecting as \<Upwork account\>" and then failed. It now defaults to a
profile it can actually send as.

> **One honest caveat.** The **opportunity score** (is this prospect worth
> pursuing?) is deliberately the same no matter which of your accounts asks —
> that's a design decision, not a bug. The profile decides **who it goes out as**
> and **which proof** is used. If you want the score to be profile-specific too,
> that's a product change to approve.

---

## BUG-39 — "Analyzing the same profile twice wastes time"

**What was wrong.** Two things: the "already analyzed" memory didn't include
your organization or the exact account, and the **Re-analyze** button still read
from that memory — so it never actually re-ran.

**What you see now.** Analyze the same prospect twice and the second time comes
back instantly with **"Previously analyzed · \<time\> · Re-analyze runs it
again"**. Pressing **Re-analyze** does a genuine fresh run.

**How to check it yourself.**
1. Analyze any prospect.
2. Without changing anything, analyze the same text again → you should get the
   "Previously analyzed" line, fast.
3. Press **Re-analyze** → it should show the progress steps and take the full
   time again.

**Measured:** the repeat call returned `reused = true` with a timestamp.

---

## BUG-40 — "Prospect captures don't show up in my daily count"

**What was wrong — the biggest one.** Relay talks to the database through
"stored procedures", and it was passing the settings **by position instead of
by name**. One of those settings was the date. So the date was being written
into the "already counted this?" slot. The result: the **first** capture of the
day counted, and every capture after that was silently ignored.

This is a data-integrity bug, not a display bug.

**What you see now.** Every capture counts, once. Repeat submissions of the
same capture don't double-count.

**How to check it yourself.**
1. Note today's **Prospects captured** number on your Today page.
2. Analyze and save two or three prospects.
3. Refresh. The number should go up by exactly the number of **new** prospects.

**Measured on the real database:** the same capture submitted twice counted
once; a second, different capture counted again.

> We did **not** rewrite any historical numbers. The rows that were affected by
> the old bug are identifiable (they carry a date in the "already counted" slot)
> and we can correct them if you approve it.

---

## BUG-41 — "Saving an Upwork draft doesn't count as an action"

**What was wrong.** The daily numbers were built only from your messages and
wins. Upwork work lives in a different place, so drafts and applications were
invisible.

**What you see now.** Saving a draft counts as **one** action. Submitting an
application counts as **one** action, separately. A draft is never reported as an
application, so your conversion numbers stay honest.

**How to check it yourself.**
1. Note today's action total.
2. Open an Upwork job, generate and **save the draft** → the total goes up by 1.
3. **Submit** it → the total goes up by 1 more.
4. The **Applications** number should only move on step 3.

---

## BUG-42 — "I acknowledge the profile and it comes back again and again"

**What was wrong.** Every time the team's coverage was re-saved, the system
created brand-new internal assignment rows and treated the change of row ID as a
brand-new assignment — wiping the "I have this" you'd clicked. So the banner
kept returning.

**What you see now.** Re-saving an unchanged team does nothing at all: no new
rows, no reset banner. A **real** change (a new operator, a new primary) still
updates correctly.

**How to check it yourself.**
1. As an operator, open Today and **acknowledge** the profile.
2. Refresh, log out and back in, and have an admin re-save the same team.
3. The banner must stay acknowledged.

**Measured:** re-saving the same team returned "unchanged", your acknowledgement
survived, and no new rows were created.

---

## How this was verified

| Bug | Automated tests | Real browser | Real database |
|---|---|---|---|
| BUG-38 | 9 | ✅ picked Aneeb → "Prospecting as Aneeb" | ✅ analyzer returned Aneeb |
| BUG-39 | 6 | ✅ | ✅ repeat call reused |
| BUG-40 | 4 | — | ✅ counted once per capture |
| BUG-41 | 4 | — | — |
| BUG-42 | 7 | — | ✅ unchanged, ack preserved |

**Full gates:** 5,800+ unit tests passing · build clean · 0 lint errors.

---

## Not fixed on purpose (needs your call)

| Item | Why |
|---|---|
| Historical prospect-capture counts from before the BUG-40 fix | Correcting them means rewriting production history. We'll do it only if you approve. |
| Deleting the old `profile_coverage` history (1,302 rows, 18 active) | It's the audit trail of who held which seat. Keeping it is intentional. |
| Making the opportunity score profile-specific | Product decision (see BUG-38 caveat). |
| The analyzer's profile dropdown can take 25–60 s to load on this host | A performance issue we measured, not a bug. Worth its own fix. |

---

## What you need to do

1. **Review and approve** this branch.
2. We open the PR and merge to `main`.
3. GitHub Actions builds and deploys to the VPS automatically.
4. We confirm the deployed version reports the right commit.
