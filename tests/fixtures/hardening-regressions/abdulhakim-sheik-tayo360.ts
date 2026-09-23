/**
 * Hardening regression fixture — Abdulhakim Sheik / Tayo360 (POSITIVE control).
 *
 * Unlike the Tammo/Saar/Avigail fixtures (which test that the pipeline stops
 * fabricating buyer signals), this fixture contains a REAL explicit
 * first-person hiring post: Abdulhakim personally posted "🚀 Hiring: Full
 * Stack Developer – Scheduling & Documentation Platform" for Tayo360,
 * listing React/Next.js/TypeScript/Node.js/NestJS/Express/PostgreSQL/AWS,
 * requesting resume/GitHub/portfolio/rate/availability, with explicit
 * apply-by-LinkedIn-or-email instructions. This must produce
 * opportunity=REAL, intent=HIGH, hiring signal=VERIFIED, and a real contact
 * action (not SKIP, not merely CONNECT_OR_OBSERVE-with-no-message).
 *
 * This fixture exists to prevent the attribution/relationship fixes
 * (subject-attribution, relationship-aware gating, remote-eligibility
 * NOT_APPLICABLE handling) from overcorrecting into suppressing genuine
 * first-person hiring signals. The critical distinction is "Tammo discusses
 * hiring (a recruiter describing his own audience/service)" vs "Abdulhakim
 * IS hiring (a prospect's own first-person hiring post with explicit apply
 * instructions, for his own company, seeking an individual contributor)."
 *
 * DO NOT tune Abdulhakim's numeric score to hit a specific number — this
 * fixture asserts QUALITATIVE invariants (intent stays HIGH/top-tier, hiring
 * signal stays verified, a real contact action survives), not a specific
 * score value.
 *
 * Since the exact original raw LinkedIn text for this profile was not
 * available verbatim to the fixture author, this is a RECONSTRUCTED-but-
 * REALISTIC equivalent, built to the same shape and semantics as the real
 * profile (LinkedIn-paste format: name, connection degree, headline,
 * location, About, Activity/Posts, Experience, Education), for
 * regression-testing purposes only. DO NOT special-case "Abdulhakim",
 * "Tayo360", or any wording from this profile anywhere in application code.
 */
export const ABDULHAKIM_SHEIK_TAYO360_RAW = `Abdulhakim Sheik
· 2nd

Founder & CEO at Tayo360

Lagos, Nigeria

·

Contact info


Tayo360


University of Lagos

2,300+

connections

Message

Follow

More
About
Building Tayo360, a production SaaS platform for scheduling, documentation, and operations for service businesses. Previously shipped several B2B web products end to end. Always happy to talk shop about React/Next.js architecture, multi-tenant SaaS, and shipping fast without breaking things.

Top skills

React • Next.js • TypeScript • Node.js • NestJS • PostgreSQL • AWS

Activity
2,300 followers

Posts

Comments

View Abdulhakim Sheik's profile
Abdulhakim Sheik

  • 2nd

Founder & CEO at Tayo360

3d •

🚀 Hiring: Full Stack Developer – Scheduling & Documentation Platform

I'm hiring a full stack developer to join the small team building Tayo360, our production SaaS scheduling and documentation platform.

Required / desired skills:
- React
- Next.js
- TypeScript
- Node.js
- NestJS
- Express
- PostgreSQL
- AWS

What you'll work on:
- Role-based access control (RBAC) across multiple tenant workspaces
- Scheduling engine and calendar sync
- Reporting dashboards
- Notifications (email + in-app)
- Third-party API integrations

This is a live, production system already in use by paying customers — not a greenfield prototype. You'll be shipping into a real codebase from week one.

Compensation: Hourly or project rate, open to discussing based on experience and availability.

Please send your resume, GitHub, and a short portfolio summary. Include your availability and preferred rate.

Apply by messaging me directly on LinkedIn or emailing asheik@tayo360.com.

#Hiring #FullStackDeveloper #ReactJS #NextJS #NodeJS #NestJS #TypeScript #PostgreSQL #AWS #Tayo360

View Abdulhakim Sheik's profile
Abdulhakim Sheik

  • 2nd

Founder & CEO at Tayo360

3w •

Shipped multi-tenant RBAC this week for Tayo360. Small detail most teams get wrong: workspace-level roles need to compose cleanly with org-level roles, or you end up with permission checks scattered everywhere. Worth the extra day to get the model right up front.

#SaaS #Engineering

Experience
Tayo360 logo
Founder & CEO

Tayo360 · Full-time

Jan 2023 - Present · 2 yrs 9 mos

Remote

Building and operating Tayo360, a production SaaS scheduling and documentation platform for service businesses, covering RBAC, scheduling, reporting, notifications, and third-party API integrations.

 Product Strategy, Team Leadership and +1 skill

Freelance Full Stack Developer

Self-employed · Freelance

Mar 2020 - Dec 2022 · 2 yrs 10 mos

Remote

Delivered web applications for clients across fintech and logistics using React, Node.js, and PostgreSQL.

Education
University of Lagos logo
University of Lagos

B.Sc, Computer Science

2015 – 2019`
