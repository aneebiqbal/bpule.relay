/**
 * Hardening regression fixture — Harvey Schwartz / Carlyle
 *
 * Real user-supplied raw LinkedIn source (exact text, unmodified).
 *
 * Source truth:
 *
 * Harvey Schwartz is CEO of The Carlyle Group (investment firm). Carlyle has
 * current momentum, is exploring AI applications via a partnership with MIT's
 * Generative AI Impact Consortium (MGAIC), and has major strategic partnerships
 * (Oracle Red Bull Racing).
 *
 * There is NO external software project, no engineering vendor request, no
 * contract role, no staff augmentation need, no consulting engagement ask.
 *
 * Reported P0 symptoms:
 * - "explicit ask for external project" inferred from AI partnership language.
 * - Remote eligibility "worldwide" inferred from absence of restrictions.
 * - "I am interested in how the firm navigates delivery risks..." note
 *   fabricates a software problem.
 * - Fit HIGH / opportunityFit from company size + AI interest.
 *
 * Core invariant: no engagement opportunity exists → remote = NOT_APPLICABLE,
 * no buyer intent, no fabricated problem. Company growth/AI interest is real
 * context but does not create a software-buying opportunity.
 */
export const HARVEY_SCHWARTZ_CARLYLE_RAW = `Harvey Schwartz
· 3rd

Chief Executive Officer at Carlyle

New York, United States

·

Contact info


The Carlyle Group


Rutgers University

28,859 followers


Follow
Connect

More

About
As Carlyle's CEO, I have the privilege of leading one of the world's largest and most diversified global investment firms. I'm dedicated to – and proud of – our mission to drive long-term value for our investors, companies, shareholders, people, and communities.

Beyond my role at Carlyle, I'm involved in investment and philanthropic initiatives focused on mental health and developing future business leaders, including women and young professionals pursuing careers in finance.

I earned my BA from Rutgers University, where I serve on the Board of Governors, and received my MBA from Columbia University.

Featured
Post

Big news: David M Rubenstein has officially joined LinkedIn.

David will use this platform to keep us updated on his work across Carlyle, business, philanthropy, history, and the Orioles…

Welcome to LinkedIn, David Rubenstein

597 reactions · 15 comments

Post

Today, we're excited to announce that Carlyle is teaming up with Oracle Red Bull Racing & Red Bull Technology as their exclusive investment management partner.

At Carlyle, we see private markets and wealth transforming global finance. Expanding access to private markets is central to that vision. Partnering with Oracle Red Bull Racing gives us a global stage to engage new audiences…

3,752 reactions · 49 comments

Activity
28,859 followers


Follow

Posts

Comments
Videos
Images

Articles

Harvey Schwartz

  • 3rd+

Chief Executive Officer at Carlyle

with The Carlyle Group • 5d • Edited • 

Good to be home in Washington, DC for our 2026 Global Investor Conference.

We spent the past few days with clients from around the world talking about some of the big shifts shaping capital allocation today: geopolitics, economic growth, national security, and AI, and what they mean for investors.

On AI, we also shared more about Carlyle's industry partnership with MIT Generative AI Impact Consortium (MGAIC). Together, we're exploring how AI can be applied across the investment process and where it can create real value…

Carlyle's 2026 Global Investor Conference

272 reactions

6 comments

•

8 reposts


Like

Comment
Repost

Send

Harvey Schwartz

  • 3rd+

Chief Executive Officer at Carlyle

1mo • 

Proud of the momentum we're building across The Carlyle Group. Our second quarter underscored the power of our diversified platform, and our performance reflects the disciplined execution of our strategy and the momentum we continue to build across the firm…

Harvey Schwartz

  • 3rd+

Chief Executive Officer at Carlyle

3mo • 

Formula 1 is often viewed as a story of technology, speed, and precision. The real story is the people behind it.

It was great to spend the weekend in Monaco with our partners at Oracle Red Bull Racing & Red Bull Technology alongside clients and colleagues…

Show all
Experience
The Carlyle Group logo
Chief Executive Officer

The Carlyle Group · Full-time

Feb 2023 - Present · 3 yrs 8 mos

New York, New York, United States

Goldman Sachs logo
President and Co-Chief Operating Officer

Goldman Sachs

1997 – 2018

Held numerous leadership positions including Chief Financial Officer and Global Co-Head of the Securities Division.

Citi logo
Vice President

Citi

1989 – 1997

Education
Rutgers University logo
Rutgers University

Bachelor of Arts - BA, Economics

Columbia University

Master of Business Administration - MBA`

/**
 * Reported symptoms:
 * - "explicit ask for external project" from AI partnership language.
 * - Remote "worldwide eligible" from absence of restrictions.
 * - "delivery risks" fabricated in generated note.
 * - Fit HIGH from company size + AI interest.
 *
 * Expected semantic direction:
 * - relationship: LARGE_COMPANY / INVESTMENT_FIRM / NETWORKING
 * - companyGrowth: SUPPORTED (attributable current evidence)
 * - buyerIntent: UNKNOWN (no external software need)
 * - opportunityFit: UNKNOWN
 * - remote: NOT_APPLICABLE (no engagement opportunity exists)
 * - CAN_CREATE_LEAD: true (Harvey/Carlyle fully identifiable)
 * - CAN_PITCH: false (no opportunity)
 */

