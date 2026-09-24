/**
 * Hardening regression fixture — Brian Maccaba / Bio-marker.ai
 *
 * Real user-supplied raw LinkedIn source (exact text, unmodified).
 *
 * Source truth: Brian Maccaba is CEO of Bio-marker.ai (AI cancer detection).
 * Current role: "Hybrid" with NO stated office location. Person location: Portugal.
 * Historical experience includes UK, Israel, Ireland, US in PAST roles
 * (Waratek in Ireland, Refana in US, consulting in UK/Israel).
 *
 * The source contains NO explicit evidence that Bio-marker.ai needs external
 * software development, is hiring engineers, or restricts vendors by geography.
 *
 * Reported symptoms:
 * - "Remote barrier: Hybrid role requires presence in UK, Israel — not
 *   compatible with Pakistan-based remote work." — historical locations wrongly
 *   become current engagement restrictions.
 * - "Not enough verified context to create a reliable lead" / "Missing: specific
 *   opportunity signal" — conflates lead identity (known) with opportunity (absent).
 * - Fit MEDIUM + "No current buyer fit" — generic Fit carries multiple meanings.
 * - CONNECT_WITHOUT_NOTE as generic fallback for "CEO of interesting company."
 *
 * DO NOT special-case "Brian", "Maccaba", "Bio-marker.ai" in application code.
 * Fixes are general: scope remote eligibility to current context, separate lead
 * identity from opportunity qualification, separate relationship fit from buyer fit.
 */
export const BRIAN_MACCABA_BIOMARKER_RAW = `Brian Maccaba
· 2nd

CEO at Bio-marker.ai

Portugal

·

Contact info


Bio-marker.ai


Harvard University

19,874 followers

·

500+

connections



Jae-Mun, Johan and 5 other mutual connections


Follow
Message
Visit my website

More
Profile enhanced with Premium

About
With over 11 years of leadership experience, including 1.5 years as CEO of Bio-marker.ai, I lead efforts to revolutionize healthcare through artificial intelligence and innovative diagnostic solutions. Bio-marker.ai is committed to saving lives and reducing healthcare costs with pioneering technologies like a blood test that enables early cancer detection at Stage 1 while distinguishing malignant cancers from benign growths.  

Drawing on expertise in cybersecurity, cloud computing, and entrepreneurship, our team tackles complex challenges to integrate cutting-edge technologies into accessible healthcare solutions. By fostering precision and collaboration, Bio-marker.ai strives to redefine cancer diagnostics, delivering impactful, life-saving tools to improve global health outcomes.

Featured
Post

World Cup 26:
Analysis of first round outcomes by Region:


Post

Going to Biomed Israel in Tel Aviv on Tuesday 


1 reaction1

Certification

Artificial Intelligence in Pharma and Biotech

MIT Sloan School of Management
Associated with MIT Sloan School of Management

Featured with Premium

Position


Chief Executive Officer

Bio-marker.ai

Dec 2024 – Present

Saving Lives. Reducing Healthcare Costs.
A simple blood test to detect multiple cancers early, at Stage 1, before they spread.
Ability to discriminate clearly between Malignant cancers and Benign growths

Featured with Premium


Activity
19,874 followers


Follow

Posts

Comments

Videos
Images
View Brian Maccaba’s profile
Brian Maccaba reposted this


View company: Thermo Fisher Scientific
Thermo Fisher Scientific

 

1mo • 

Learn how optimized workflows achieved greater than 95% post-isolation purity while maintaining strong activation, viability, and expansion performance.

Download the data.… more


Achieve High-Purity T Cell IsolationAchieve High-Purity T Cell Isolation

documents.thermofisher.com

Learn more
4 reactions4

1 repost1 repost


Like

Comment
Repost
Send
View Brian Maccaba’s profile
Brian Maccaba

  • 2nd

CEO at Bio-marker.ai

Visit my website

2mo • 


Breakdown of World Cup 26 first round outcomes by region:

View image
2 reactions2


Like

Comment
Repost
Send
View Brian Maccaba’s profile
Brian Maccaba

  • 2nd

CEO at Bio-marker.ai

Visit my website

2mo • Edited • 


World Cup 26:
Analysis of first round outcomes by Region:

View image

Like

Comment

Repost
Send
View Brian Maccaba’s profile
Brian Maccaba

  • 2nd

CEO at Bio-marker.ai

Visit my website

2mo • 


View image

Like

Comment

Repost
Send
View Brian Maccaba’s profile
Brian Maccaba

  • 2nd

CEO at Bio-marker.ai

Visit my website

3mo • 


https://lnkd.in/dTejX-9u


Sebastian Kurz went from Austria's youngest chancellor to building a $3 billion AI cybersecurity startupSebastian Kurz went from Austria's youngest chancellor to building a $3 billion AI cybersecurity startup

businessinsider.com


Like

Comment

Repost
Send
View Brian Maccaba’s profile
Brian Maccaba

  • 2nd

CEO at Bio-marker.ai

Visit my website

3mo • 


VIVA Mexico 

View image
1 reaction1

1 comment1 comment


Like

Comment

Repost
Send
View Brian Maccaba’s profile
Brian Maccaba

  • 2nd

CEO at Bio-marker.ai

Visit my website

3mo • 


https://lnkd.in/eqfpWWEU


The science around GLP-1 drugs and cancer is suddenly getting a lot more interestingThe science around GLP-1 drugs and cancer is suddenly getting a lot more interesting

washingtonpost.com

2 reactions2


Like

Comment

Repost
Send
View Brian Maccaba’s profile
Brian Maccaba

  • 2nd

CEO at Bio-marker.ai

Visit my website

3mo • 


How the world changes - the MG Cyberster totally crushes Ferrari's new Luce, at 20% of the price.........

View image
1 reaction1

1 comment1 comment


Like

Comment

Repost
Send
View Brian Maccaba’s profile
Brian Maccaba

  • 2nd

CEO at Bio-marker.ai

Visit my website

4mo • 


https://lnkd.in/dMhse69j


The man behind the PSA testThe man behind the PSA test

roswellpark.com

1 reaction1


Like

Comment

Repost
Send
View Brian Maccaba’s profile
Brian Maccaba

  • 2nd

CEO at Bio-marker.ai

Visit my website

4mo • 


View image
1 reaction1


Like

Comment

Repost
Send

Show all
Experience
Bio-marker.ai logo
Chief Executive Officer

Bio-marker.ai · Full-time

Dec 2024 - Present · 1 yr 10 mos

Hybrid

Saving Lives. Reducing Healthcare Costs.
A simple blood test to detect multiple cancers early, at Stage 1, before they spread.
Ability to discriminate clearly between Malignant cancers and Benign growths… more

Refana logo
Chief Executive Officer

Refana

May 2020 - Jan 2025 · 4 yrs 9 mos

United States

Chairman

Waratek Holdings Ltd

Jan 2017 - Jun 2021 · 4 yrs 6 mos

Waratek logo
CEO

Waratek

2011 – 2017

Ireland

CEO

Brian Maccaba Venture Consulting

Feb 2010 - Jun 2012 · 2 yrs 5 mos

Advising startups in UK, Israel and Ireland on Product Development, Market Entry, Business Strategy and Funding. 

Why Software Doesn't Follow Moore's Law

In 1965 Gordon Moore, co-founder of Intel, predicted that the number of transistors per square inch on integrated circuits, which had doubled every year since they had been invented, would continue to do so for the foreseeable future. That prediction proved remarkably visionary. So why haven't computer systems achieved the same advances [...]

Show all`

/**
 * Reported symptoms against this fixture (as observed by the user before any
 * fix — kept for traceability; the regression tests live in
 * tests/hardening-regression-brian.test.ts):
 *
 * - Remote eligibility: "Hybrid role requires presence in UK, Israel — not
 *   compatible with Pakistan-based remote work." Historical locations (UK, Israel
 * from 2010-2012 consulting; Ireland from Waratek 2011-2017) wrongly become
 *   current engagement restrictions. "Hybrid" alone != vendor restriction.
 * - Lead creation blocked: "Not enough verified context to create a reliable
 *   lead" / "Missing: specific opportunity signal." Conflates known person/
 *   company identity with absent buying signal.
 * - Fit MEDIUM + "No current buyer fit" — one generic Fit field carries
 *   multiple meanings (relevance vs buyer fit).
 * - CONNECT_WITHOUT_NOTE as generic fallback for "CEO of interesting company"
 *   with no actual relationship value established.
 *
 * Expected semantic direction (NOT a numeric score target):
 * - Remote eligibility: NOT_APPLICABLE (no engagement with geography relevant).
 * - Lead identity: KNOWN (Brian Maccaba, CEO, Bio-marker.ai, cancer AI).
 * - Opportunity: NONE (no buying/project signal).
 * - Action: OBSERVE (no reason to contact beyond "CEO of interesting company").
 */
