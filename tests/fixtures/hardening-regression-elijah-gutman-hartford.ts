/**
 * Hardening regression fixture — Elijah Gutman / Hartford AI Partners
 *
 * Real user-supplied raw LinkedIn source (exact text, unmodified).
 *
 * Source truth: Elijah runs Hartford AI Partners, an AI implementation
 * consultancy that sells AI consulting, custom automations, AI agents, AI
 * training, IT consulting, and management consulting. He describes hands-on
 * work in RAG architecture, agentic workflows, n8n automation, AI security.
 *
 * He has historically directed offshore engineering contractors. He posted
 * about a partner organization looking for a COO. His own employment is
 * Remote/Hybrid.
 *
 * CRITICAL: Hartford AI Partners SELLS services that overlap with BPulse's
 * offering. This is CAPABILITY OVERLAP, NOT buyer intent. Selling AI
 * implementation ≠ needing AI implementation.
 *
 * There is NO evidence Hartford AI Partners currently needs to buy external
 * software-delivery services.
 *
 * Reported symptoms:
 * - Intent MEDIUM (read as "medium likelihood he needs our service") — wrong.
 *   Should be UNKNOWN buyer intent; partnership intent is a separate axis.
 * - Fit LOW while relationship says recruiter/partner/peer — ambiguous Fit.
 * - Generic "Intent MEDIUM" collapses partnership evidence into buyer signal.
 * - COO post attributed to a partner org, not Hartford AI Partners.
 * - Offshore contractor history does not create current need.
 * - CONNECT_WITHOUT_NOTE used as generic fallback without relationship rationale.
 *
 * DO NOT special-case "Elijah", "Gutman", "Hartford AI Partners" in application
 * code. Fixes are general: separate buyer intent from partnership intent,
 * separate service-buyer fit from partnership fit.
 */
export const ELIJAH_GUTMAN_HARTFORD_AI_RAW = `Elijah Gutman
· 2nd

CEO at Hartford AI Partners

I help mid-market and enterprise companies adopt AI
Remote

United States

·

Contact info


Hartford AI Partners


Harvard Business School

6,854 followers

·

500+

connections



Alex, Jordan and 12 other mutual connections


Follow
Message
Visit my website

More
Profile enhanced with Premium

About
CEO of Hartford AI Partners. We help mid-market and enterprise organizations
implement AI that actually delivers ROI — not hype.

Hartford AI Partners provides:
→ AI implementation consulting
→ Custom automations and AI agents
→ AI training and adoption programs
→ IT consulting and management consulting

I've spent years in the trenches building RAG architectures, agentic
workflows, and end-to-end automation pipelines. Hands-on with n8n, vector
databases, orchestration frameworks, and AI security/governance.

Previously directed offshore engineering contractors for client delivery across
regulated industries.

Featured
Post

Excited to share that one of our partner organizations is looking for a COO.
Great opportunity for the right leader. DM me for details.

Post

The gap between AI proof-of-concept and production deployment is where most
companies fail. We bridge that gap.

32 reactions32

8 comments8 comments

Certification

AI Governance and Risk Management

MIT Sloan School of Management
Associated with MIT Sloan School of Management

Featured with Premium

Position


Chief Executive Officer

Hartford AI Partners

Jan 2023 – Present · 2 yrs 11 mos

Remote

Building AI solutions that deliver measurable business outcomes. From RAG to
agentic systems to full automation pipelines.

Featured with Premium


Activity
6,854 followers


Follow

Posts

Comments

Videos
View Elijah Gutman’s profile
Elijah Gutman reposted this


View company: Microsoft
Microsoft

 

1mo • 

AI transformation is not about the model — it's about the workflow. Organizations
that redesign processes around AI capabilities see 3x the ROI.

Learn more
18 reactions18

4 comments4 comments


Like

Comment
Repost
Send
View Elijah Gutman’s profile
Elijah Gutman

  • 2nd

CEO at Hartford AI Partners

Visit my website

2mo • 


Just closed a major automation engagement with a healthcare client. Custom
agentic workflow handling prior authorization — reduced processing time by 60%.

12 reactions12

3 comments3 comments


Like

Comment

Repost
Send
View Elijah Gutman’s profile
Elijah Gutman

  • 2nd

CEO at Hartford AI Partners

Visit my website

3mo • 


RAG architecture decisions made early determine whether your AI system scales or
collapses under load. Choose wisely.

View image
8 reactions8


Like

Comment

Repost
Send
View Elijah Gutman’s profile
Elijah Gutman

  • 2nd

CEO at Hartford AI Partners

Visit my website

4mo • 


n8n vs LangFlow vs custom build — when to use what for enterprise automation.
Thread below.

View image
15 reactions15

6 comments6 comments


Like

Comment

Repost
Send
View Elijah Gutman’s profile
Elijah Gutman

  • 2nd

CEO at Hartford AI Partners

Visit my website

5mo • 


AI security and governance frameworks are no longer optional. Every client
engagement now starts with a security audit.

View image
6 reactions6


Like

Comment

Repost
Send

Show all
Experience
Hartford AI Partners logo
Chief Executive Officer

Hartford AI Partners

Jan 2023 – Present · 2 yrs 11 mos

Remote

Building AI solutions that deliver measurable business outcomes. RAG
architectures, agentic workflows, custom automations, AI security and
governance. Helping clients move from proof-of-concept to production.

Refana logo
Chief Executive Officer

Refana

May 2020 - Jan 2023 · 2 yrs 9 mos

United States

Directed offshore engineering contractors for client delivery across regulated
industries. Managed cross-functional teams building custom software solutions.

Waratek logo
Senior Consultant

Waratek

2016 – 2020

Ireland

Led consulting engagements for enterprise clients on technology strategy and
digital transformation.

Education
Harvard Business School logo
Harvard Business School

Master of Business Administration (MBA)

2010 – 2012`

/**
 * Reported symptoms against this fixture:
 *
 * - Intent MEDIUM — partnership/capability-overlap evidence wrongly inflates
 *   buyer intent. Should be UNKNOWN buyer intent; partnership is a separate axis.
 * - Fit LOW + "recruiter/partner/peer" relationship — one generic Fit field
 *   carries multiple, conflicting meanings.
 * - COO post is a partner organization's opening, not Hartford AI Partners hiring.
 * - Offshore contractor history (Refana 2020-2023) must not become current need.
 * - CONNECT_WITHOUT_NOTE as generic fallback without relationship rationale.
 * - NO_MESSAGE rendered as empty 0/300 composer.
 *
 * Expected semantic direction:
 * - serviceBuyerFit: LOW (overlapping provider, not a buyer)
 * - partnershipFit: MEDIUM/HIGH (adjacent AI operator, ecosystem value)
 * - buyerIntent: UNKNOWN (no evidence Hartford AI Partners needs our services)
 * - partnershipIntent: LOW/MEDIUM (ecosystem relationship, not yet a concrete ask)
 * - relationship: PEER / POTENTIAL_PARTNER
 * - remote: NOT_APPLICABLE (employment data, no engagement restriction)
 * - action: CONNECT_OBSERVE / CONNECT_WITHOUT_NOTE (if relationship rationale exists)
 */
