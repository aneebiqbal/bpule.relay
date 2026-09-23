/**
 * Hardening regression fixture — Tammo Strunk / Find a Job in Germany
 *
 * Real user-supplied raw LinkedIn source (exact text, unmodified). Added as a
 * permanent semantic regression fixture after a reported case of the pipeline
 * converting MARKET-LEVEL statistics and recruiting-audience language into
 * TARGET-LEVEL buyer evidence:
 *
 * - "79,000 unfilled IT positions in Germany" (a German labor-market
 *   statistic Tammo comments on) became HIGH intent / immediate need for
 *   Tammo himself.
 * - German GDP/AI-market growth (market commentary) became a growth signal
 *   for Tammo's company.
 * - "anyone looking for a job in Germany" (Tammo describing his AUDIENCE of
 *   job seekers) classified the whole profile as a job-seeker profile and
 *   produced remote eligibility "candidate is open to opportunities".
 * - The profile is a career-coaching / international-recruitment business
 *   (helping tech professionals land jobs in Germany), which is a
 *   RECRUITER/PARTNER/NETWORKING relationship, not a software-service
 *   buyer relationship.
 *
 * DO NOT special-case "Tammo", "Strunk", "Find a Job in Germany", or any
 * wording from this profile anywhere in application code. Fixes derived from
 * this fixture must be general semantic fixes (subject/ownership attribution,
 * market-vs-target evidence separation, relationship-before-opportunity),
 * verified by running this fixture, not fixes that pattern-match this text.
 *
 * Temporal note (source truth, preserve ambiguity): the headline says
 * "Managing Partner @ Find a Job in Germany" (present tense) while the
 * experience entry reads "Apr 2020 - Mar 2026" (an end date in the past
 * relative to capture). The pipeline must not silently resolve this
 * disagreement in whichever direction produces the stronger opportunity.
 */
export const TAMMO_STRUNK_FAJIG_RAW = `Tammo Strunk
· 2nd

Managing Partner @ Find a Job in Germany | Helped 1k+ Tech & IT professionals land jobs in Germany

Berlin, Germany

·

Contact info


Technische Universität Dresden

78,534 followers



Daniyal, SAMI and 85 other mutual connections


Follow
Message
Book an appointment

More
Profile enhanced with Premium

Highlights

1 mutual group

You and Tammo are both in JavaScript

About
On a mission to connect international Tech & IT professionals with the German job market, especially English-speaking job opportunities.
 
I help skilled professionals navigate the complex process of finding a job in Germany, from CV optimization and interview preparation to understanding the hiring mindset of German companies.
 
1,000+ candidates coached in their journey to Germany, improving their careers, salaries, and quality of life in Germany.

Book your free get-to-know call here: https://www.findajobingermany.de/how-to-find-a-job-in-germany-as-a-tech-it-professional-in-2-months

Activity
78,534 followers


Follow

Posts

Comments

Images
View Tammo Strunk’s profile
Tammo Strunk

  • 2nd

Managing Partner @ Find a Job in Germany | Helped 1k+ Tech & IT professionals land jobs in Germany

Book an appointment

5h • 


Some positive news for anyone looking for a job in Germany. 🇩🇪

The outlook for the German economy is finally improving.

The OECD has just raised its growth forecast for Germany significantly:
→ Previous 2026 forecast: +0.7%
→ New 2026 forecast: +1.1%
→ 2027 forecast: +1.1%

One of the reasons is particularly interesting for Tech professionals:
German exports performed better than expected in the first half of 2026, partly driven by increasing demand for electronics and equipment related to the AI boom. Public investment in infrastructure is also contributing to the recovery.

Of course, 1.1% growth isn't an economic boom.

But after several difficult years, the direction matters.

A stronger economy generally gives companies more confidence to invest, grow and eventually hire again.

And that could be particularly important for job seekers.

2025 and 2026 have been difficult years in the German job market. Companies could be extremely selective because there were fewer vacancies and more candidates competing for them.

Hopefully, 2027 will start shifting that balance again.

There are still risks and the OECD itself emphasizes considerable uncertainty around the outlook. But for international professionals considering Germany, this is at least an encouraging signal:

The German economy appears to be moving back toward growth. 🇩🇪… more

176 reactions176

12 comments12 comments

•

2 reposts2 reposts


Like

Comment
Repost
Send
View Tammo Strunk’s profile
Tammo Strunk

  • 2nd

Managing Partner @ Find a Job in Germany | Helped 1k+ Tech & IT professionals land jobs in Germany

Book an appointment

11h • 


Germany's AI market is growing by 48% in just one year. 🇩🇪🤖

And the outlook for 2027 is even more interesting.

According to new Bitkom figures released yeterday:
→ AI spending in Germany reached €19.4 billion in 2025
→ It is expected to hit €28.7 billion in 2026
→ And €40.3 billion in 2027

That means Germany's AI market could more than double within just two years.

For international Tech professionals looking at Germany, this is an important signal.

Because this investment isn't only relevant for AI Engineers.

Companies need Software Engineers to integrate AI into products, Data Engineers to build the infrastructure behind it, Cloud Engineers to run it and people who understand how to turn AI into actual business value.

The German Tech job market is challenging right now.

But €40 billion in expected AI spending tells us pretty clearly where a lot of future investment is going.

And that's worth paying attention to going into 2027.… more

23 reactions23

1 comment1 comment


Like

Comment
Repost
Send
View Tammo Strunk’s profile
Tammo Strunk

  • 2nd

Managing Partner @ Find a Job in Germany | Helped 1k+ Tech & IT professionals land jobs in Germany

Book an appointment

1d • 


Germany needs international IT talent. But are German companies actually looking for it? 🇩🇪

Germany still has around 79,000 unfilled IT positions, and 76% of companies expect the IT skills shortage to become worse again in the coming years.

At the same time, only 6% of companies with IT positions say they are increasing recruitment from abroad.

And 58% say stronger support for skilled immigration would help them meet their IT talent needs.

For me, this is one of the biggest opportunities Germany still has.
 
There are experienced Software Engineers, Data Engineers, AI Engineers, Cloud and Cybersecurity professionals around the world who would happily build their careers in Germany.
 
Germany has already made immigration for qualified professionals comparatively accessible.

Now more companies need to become comfortable actually hiring internationally.

Because if Germany expects the IT talent shortage to grow again, the German labor market alone won't be enough. 🇩🇪🌍… more

93 reactions93

17 comments17 comments


Like

Comment
Repost
Send
View Tammo Strunk’s profile
Tammo Strunk

  • 2nd

Managing Partner @ Find a Job in Germany | Helped 1k+ Tech & IT professionals land jobs in Germany

Book an appointment

2d • 


Do you really need German to get an IT job in Germany? 🇩🇪

The answer is becoming more nuanced.
 
There are still plenty of Tech & IT jobs in Germany where English is the working language. We see international professionals getting hired into English-speaking roles regularly.
 
But German is becoming a serious competitive advantage.
 
A new Bitkom study found that 47% of German companies with IT positions say insufficient German skills are one of the difficulties they face when filling IT jobs.

Interestingly, that figure was only 35% in 2025.

For international Tech & IT professionals, I think the message is pretty clear:
 
You don't necessarily need German to start your career in Germany.
 
But even B1/B2 conversational German can open up a much larger part of the market, especially outside international startups and large English-speaking tech organizations.
 
And one important point:
 
Your certificate matters less than whether you can actually hold a job interview and communicate with colleagues in German.

So if you're currently applying with English only, keep applying.
 
But start learning German at the same time.

It might be one of the highest-return investments you can make in your career in Germany. 🇩🇪… more

101 reactions101

22 comments22 comments

•

1 repost1 repost


Like

Comment
Repost
Send
View Tammo Strunk’s profile
Tammo Strunk

  • 2nd

Managing Partner @ Find a Job in Germany | Helped 1k+ Tech & IT professionals land jobs in Germany

Book an appointment

4d • 


Meanwhile, the German Tech job market in 2026: 🇩🇪

“We can't find enough qualified IT professionals.”
 
Also the job description:
 
→ Fluent German, even though the Tech team works in English
 → 8+ years of experience, including 5 years with a technology released 3 years ago
 → Backend + Frontend + Cloud + DevOps + Data + AI would be great
 → Expert in the latest AI tools while bringing 15 years of enterprise experience
 → Come to the office 4 days a week because... collaboration
 → Relocate your entire family to Germany before we seriously consider you
 → Complete 4 to 6 interview rounds
 → Salary: “competitive”
 → Training budget: €500
 → Must be able to hit the ground running from Day 1
 
Then six months later:

“There is a Fachkräftemangel. We simply can't find the right people.”

Of course companies need qualified people, and German is genuinely necessary for many roles.
 
But companies also need to be realistic about what they are asking for.
 
If you need someone who speaks fluent German, knows the newest technologies, has deep hands-on experience, understands the business, covers the responsibilities of several roles and can contribute from Day 1, that person exists.

But there aren't many of them. And they probably have options.

Maybe Germany's IT skills shortage is partly also a question of whether companies are willing to hire a strong 80–90% match and develop the remaining 10–20%.

Hopefully, we will see this balance shift again in 2027.

Germany's economy is expected to continue its recovery next year. The latest ifo forecast expects 1.2% growth in 2027, alongside a decline in unemployment. 
 
If companies start hiring more actively again, candidates should regain some bargaining power too.
 
And maybe then we will move from searching for the perfect candidate back to hiring good people with the potential to grow.… more

276 reactions276

32 comments32 comments

•

8 reposts8 reposts


Like

Comment
Repost
Send
View Tammo Strunk’s profile
Tammo Strunk

  • 2nd

Managing Partner @ Find a Job in Germany | Helped 1k+ Tech & IT professionals land jobs in Germany

Book an appointment

5d • 


AI skills are becoming a basic requirement for IT professionals in Germany. 🇩🇪🤖

And this is no longer just about AI Engineers.
 
According to a new Bitkom study, 63% of German companies expect knowledge of AI and AI tools to become necessary across all IT professions.

I think this is one of the biggest changes happening in the Tech & IT job market right now.
 
If you're a:
 
Software Engineer → use AI in development
 Data Engineer → understand AI-driven data use cases
 DevOps Engineer → use AI for automation and operations
 Cybersecurity Engineer → understand AI-enabled security
 Cloud Engineer → understand how AI workloads run and scale
 
You don't necessarily need to become an AI Engineer.
 
But you should understand how AI changes your profession and how you can use it to become better at what you already do.

This is also what we're increasingly seeing in job descriptions and interviews.
 
Companies want people who combine strong fundamentals with modern AI capabilities.

My advice for Tech & IT professionals looking at Germany in 2027: don't completely reinvent your profile around AI. Add AI to the expertise you already have.

That combination could become increasingly valuable. 🇩🇪

… more

Wajeeh ul Hassan and 84 others reactedWajeeh ul Hassan and 84 others

8 comments8 comments

•

1 repost1 repost


Like

Comment
Repost
Send
View Tammo Strunk’s profile
Tammo Strunk

  • 2nd

Managing Partner @ Find a Job in Germany | Helped 1k+ Tech & IT professionals land jobs in Germany

Book an appointment

6d • 


97% of German companies say they struggle to fill their IT positions. 🇩🇪

At the same time, I speak to experienced Tech & IT professionals every week who struggle to get interviews.
 
How can both be true?
 
A new Bitkom study gives us some interesting answers.
 
Germany still has around 79,000 unfilled IT positions. But companies are becoming much more specific about whom they need. 
 
Among the biggest hiring challenges:
 
→ 47% mention insufficient German skills
 → 43% say candidates lack the required professional qualifications
 → 33% say applicants lack knowledge of the latest technologies
 → 32% mention missing soft skills 
 
And AI is accelerating the change.

63% of companies expect AI knowledge and tools to become necessary across all IT professions. 61% expect IT professionals to face increasing pressure to continuously develop their skills. 
 
Interestingly, the most frequently sought profiles aren't only AI Engineers.
 
Companies with vacancies are particularly looking for people in IT administration & operations, software development & architecture, cloud & infrastructure, AI and cybersecurity.

So when people say:
 
"Germany has an IT skills shortage, why can't I find a job?"
 
This is part of the answer.
 
There is still demand. But having an IT background alone isn't enough anymore.

Your experience, tech stack, language skills and positioning need to match what companies actually need today.
 
And that gap between available talent and the talent companies are looking for might be one of the biggest challenges in Germany's Tech market right now.… more

349 reactions349

91 comments91 comments

•

7 reposts7 reposts


Like

Comment
Repost
Send
View Tammo Strunk’s profile
Tammo Strunk

  • 2nd

Managing Partner @ Find a Job in Germany | Helped 1k+ Tech & IT professionals land jobs in Germany

Book an appointment

1w • 


When you think about Germany, you probably think about cars, engineering and manufacturing. 🇩🇪

But Germany's digital economy has quietly become enormous.
 
It now generates around €481 billion in gross value added, representing almost 12% of Germany's economic output. That's more than twice the share attributed to the automotive industry.
 
And I think this tells us something important about where Germany is heading.
 
Tech in Germany is no longer just about working for a software company.
 
Some of the most interesting opportunities are being created where technology meets traditional German industry:
 
AI in manufacturing.
Software in automotive.
Data in energy.
Cloud in banking.
Automation in logistics.
Cybersecurity across almost everything.
 
And now AI is accelerating this transformation even further.
 
For international Tech & IT professionals looking at Germany, I would therefore think much broader than Berlin startups and the big tech names.

Germany has thousands of companies that don't look like tech companies but increasingly need to become tech companies.

And that could create a lot of interesting opportunities over the coming years. 🇩🇪… more

39 reactions39

2 comments2 comments

•

1 repost1 repost


Like

Comment
Repost
Send
View Tammo Strunk’s profile
Tammo Strunk

  • 2nd

Managing Partner @ Find a Job in Germany | Helped 1k+ Tech & IT professionals land jobs in Germany

Book an appointment

1w • 


Last Friday, we had the chance to meet some of our FAJIG clients in person.
 
People from different countries, backgrounds and career paths, all connected by the same goal: building their career in Germany.

It was great to finally meet face-to-face, exchange experiences and simply spend some time together beyond CVs, applications and interviews.

Thanks to everyone who joined! ❤️

Looking forward to the next one.… more

View image
88 reactions88

4 comments4 comments

•

1 repost1 repost


Like

Comment
Repost
Send
View Tammo Strunk’s profile
Tammo Strunk

  • 2nd

Managing Partner @ Find a Job in Germany | Helped 1k+ Tech & IT professionals land jobs in Germany

Book an appointment

1w • 


More than 6 million international employees are now working in Germany. 🇩🇪🌍

For the first time, Germany has crossed this milestone.
 
In June, 6.02 million foreign nationals were in jobs subject to social security contributions. That means roughly 1 in 6 employees in Germany does not have a German passport.
 
And their importance to the German economy continues to grow.
 
According to the Federal Employment Agency, without international employees, employment in Germany would already have been declining for some time.
 
Since 2024, employment growth has been driven entirely by foreign workers.

This shows just how important international professionals have become for Germany's economy and labor market.
 
With an ageing population and growing demographic pressure, Germany will continue to need people from around the world who want to work, contribute and build their future here.
 
Technology and AI will increase productivity, but they won't solve Germany's demographic challenge alone.
 
Germany therefore has a huge opportunity:
 
Attract international talent.
 Help those already here enter the workforce.
 Make companies more open to hiring internationally.
 And create an environment where people want to stay.

6 million international employees aren't a future scenario. They are already an essential part of today's Germany. 🇩🇪… more

176 reactions176

24 comments24 comments

•

4 reposts4 reposts


Like

Comment
Repost
Send

Show all
Experience
Find a job in Germany logo
Co-Founder and Managing Partner

Find a job in Germany

Apr 2020 - Mar 2026 · 6 yrs

Berlin, Germany

We coach international Tech & IT professionals to land a job in Germany in up to 2 months from now.

Book your free get-to-know call here: https://www.findajobingermany.de/how-to-find-a-job-in-germany-as-a-tech-it-professional-in-2-months… more

AfricaWorks logo
Co-Founder and Managing Partner

AfricaWorks

Apr 2016 - Apr 2020 · 4 yrs 1 mo

Berlin Metropolitan Area

Co-founded AfricaWorks, focusing on international tech recruitment for the German and Austrian markets.

Recruited and placed international IT and tech professionals across software engineering, data, and IT roles, managing the full hiring lifecycle from sourcing to relocation.

Partnered with startups and multinational companies in Germany and Austria, delivering qualified candidates aligned with technical requirements and business needs.

Built and scaled international talent pipelines, sourcing candidates globally and enabling cross-border hiring at speed.

Led client engagements, translating hiring needs into effective recruitment strategies and consistently delivering high-quality matches.

Oversaw project management and operations, ensuring efficient execution and strong client satisfaction.… more

Junior Consultant

Euro Informationen

Jan 2012 - Aug 2012 · 8 mos

Berlin

Online Marketing and Communication

Education
Technische Universität Dresden logo
Technische Universität Dresden

Master of Arts (MA), Political Science

2012 – 2015

Københavns Universitet - University of Copenhagen logo
Københavns Universitet - University of Copenhagen

Bachelor of Arts (BA), Political Science and Sociology

2010 – 2011

Show all 3 educations
Licenses & certifications
Scrum.org logo
Professional Scrum Master I

Scrum.org

Issued Nov 2019`

/**
 * Reported symptoms against this fixture (as observed by the user before any
 * fix — kept here for traceability, not as assertions; the regression tests
 * live in tests/hardening-regression-tammo.test.ts):
 *
 * - Score 87, "Strong opportunity", Fit HIGH, Intent HIGH, Confidence HIGH.
 * - Intent justification "Current, explicit need or active hiring/project
 *   ask." and contact reason "There is a current, explicit need — hiring, a
 *   project ask, or a public request for help." — derived from German
 *   labor-market statistics and market commentary, not from any attributable
 *   commercial action by Tammo or Find a Job in Germany.
 * - growth_signal + immediate_need attributed to the target from German
 *   GDP/AI-market growth commentary.
 * - Remote eligibility rendered as compatible because "candidate is open to
 *   opportunities" — job-seeker semantics applied to a non-job opportunity,
 *   sourced from audience language ("anyone looking for a job in Germany").
 * - Opportunity-level "relevant proof" and sender-level "No verified proof
 *   matches for this sender" displayed simultaneously with no distinction.
 * - Connection note claimed "I work in this space too" without a verified
 *   sender Revenue Identity supporting that claim.
 *
 * Expected semantic direction (NOT a numeric score target):
 * - Relationship: recruiting / career-services professional → RECRUITER /
 *   POTENTIAL_PARTNER / NETWORKING classification BEFORE opportunity.
 * - Buyer intent: UNKNOWN (or LOW) unless attributable current evidence of a
 *   commercial action toward the target exists. Market statistics, industry
 *   problems, thought leadership, and generic hiring demand are insufficient.
 * - Confidence may remain HIGH about what the person does while intent stays
 *   UNKNOWN — confidence describes evidence quality, not intent strength.
 * - Remote eligibility: NOT_APPLICABLE semantics for a non-employment
 *   relationship (geography is irrelevant to a networking/partnership
 *   contact), and in any case must not be derived from job-seeker language.
 * - CONNECT WITH NOTE / CONNECT_OR_OBSERVE can remain a valid action WITHOUT
 *   HIGH buyer intent — do not inflate intent to justify contacting.
 */
