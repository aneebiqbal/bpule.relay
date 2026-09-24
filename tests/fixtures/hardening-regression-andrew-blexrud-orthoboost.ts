/**
 * Hardening regression fixture — Andrew Blexrud / Orthoboost
 *
 * Real user-supplied raw LinkedIn source (exact text, unmodified).
 *
 * Source truth:
 *
 * Andrew is Founder of Orthoboost, a growth/marketing agency that sells TO
 * orthopedic practices. His About section explicitly names his customer
 * segment's problem ("orthopedic practices that feel they've hit a
 * plateau"), his offering (patient acquisition, operational efficiency,
 * data-driven marketing, automation, messaging), and closes with a seller
 * CTA aimed at that customer segment ("If you're ready to rethink your
 * growth strategy and get back on track, let's connect.").
 *
 * This is a P0 seller-CTA-vs-buyer-ask regression: the pipeline previously
 * read Andrew's own outbound sales pitch as an explicit ask for external
 * engineering help directed at BPulse — i.e. it inverted who has the
 * problem (orthopedic practices, not Andrew/Orthoboost) and who is speaking
 * to whom (Andrew, the seller, addressing his own prospective customers, not
 * asking anyone for help).
 *
 * Invariant under test — before `explicit_ask`/buyer-intent signals may
 * register, the pipeline must resolve:
 *   WHO IS SPEAKING → WHO HAS THE PROBLEM → WHO SOLVES IT →
 *   WHO IS BEING ADDRESSED → WHAT IS REQUESTED → COMMERCIAL DIRECTION
 *
 * "I help X solve Y" identifies X as the problem owner and the speaker as
 * the solution provider — never the reverse. A seller CTA ("let's connect")
 * aimed at the speaker's own customer segment is not a buyer request
 * directed at BPulse. Mentioning "automation" as part of what is offered to
 * customers is not a request for automation development.
 *
 * DO NOT special-case "Andrew", "Orthoboost", or wording from this profile
 * anywhere in application code, and do not tune his numeric score. Fixes
 * derived from this fixture must be general semantic fixes (commercial-
 * direction/speaker-vs-problem-owner classification), verified by running
 * this fixture, not fixes that pattern-match this text.
 */
export const ANDREW_BLEXRUD_ORTHOBOOST_RAW = `Andrew Blexrud
· 3rd

Founder at Orthoboost

Gulf Shores, Alabama, United States

·

Contact info

Orthoboost


Minnesota State College Southeast

zaap.bio/blex

333

connections

Message

Follow

More
About
In business, growth often stalls—not because the product or service is lacking, but because the strategies in place are no longer working. I work with orthopedic practices that feel they've hit a plateau, helping them navigate that stagnation by recalibrating their approach to patient acquisition and operational efficiency.

As the founder of Orthoboost, my focus is on applying strategic, data-driven marketing principles that not only break through plateaus but also foster sustainable, long-term growth. By using tools like automation and refining messaging, I help practices shift their trajectory and reconnect with their potential.

I've seen time and time again that when the right questions are asked and the right strategies are put in place, results follow. If you're ready to rethink your growth strategy and get back on track, let's connect.

Activity
350 followers


Follow
Andrew has no recent posts

Recent posts Andrew shares will be displayed here.

Show all
Experience
Founder

Orthoboost · Self-employed

Jan 2019 - Present · 7 yrs 9 mos

Co-Founder

Furrbabe.com · Full-time

Jan 2016 - Present · 10 yrs 9 mos

Fastenal logo
Sales Professional

Fastenal · Full-time

Dec 2012 - Jun 2016 · 3 yrs 7 mos

Education
Minnesota State College Southeast logo
Minnesota State College Southeast

Associate of Arts and Sciences - AAS, Marketing

Winona State University logo
Winona State University

Business

Volunteering

Panelist

Becker's Healthcare

Oct 2022 · 1 mo

Panelist at Becker's Healthcare Annual ASC Meeting

Digital Marketing Coordinator

Ales for Alzheimers

Sep 2017 - Oct 2017 · 2 mos

Executed digital marketing campaign for Ales for Alzheimer's, ultimately raising $45,000 for Alzheimer's & Dementia Alliance of Wisconsin.

Interests

Companies

Schools

Surgery Business Magazine, CompanySurgery Business Magazine

1,379 followers


Follow

OneWater Marine, CompanyOneWater Marine

3,709 followers


Follow`
