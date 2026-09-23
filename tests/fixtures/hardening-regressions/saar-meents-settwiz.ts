/**
 * Hardening regression fixture — Saar Meents / SettWiz.
 *
 * Tests third-party-organization attribution. The raw text contains a
 * REPOST of a post by Kobi Bendelak (CEO at InsurTech Israel, NOT Saar, NOT
 * SettWiz) that mentions an InsurTech roadshow visiting Physicians Mutual,
 * Mutual of Omaha, Blue Cross and Blue Shield of Nebraska, WoodmenLife,
 * Aflac, Ameritas — these are companies the DELEGATION (including SettWiz)
 * visited. They are absolutely NOT Saar's employer, not SettWiz's office,
 * not Saar's workplace, not an onsite requirement, and not evidence against
 * Pakistan-based (or any other remote) service delivery.
 *
 * Before this fix, the pipeline could incorrectly produce something like
 * "Remote barrier: On-site role required in Physicians Mutual, Mutual — not
 * compatible with Pakistan-based remote work" — attributing a third-party
 * meeting-location mention to Saar's own workplace/remote-eligibility.
 *
 * The fixture also tests that Saar's OWN "Israel · Hybrid" experience entry
 * (his actual employment arrangement as Founder & CEO of SettWiz) is not
 * automatically read as "external BPulse software vendor must work hybrid in
 * Israel" — that is a category error between EMPLOYMENT workplace_type and
 * SERVICE-DELIVERY engagement restriction.
 *
 * And it tests relationship classification: Saar is a founder actively doing
 * business development/partnership-seeking ("Open to partnerships with
 * carriers, TPAs, and advisors", attending roadshows, sponsoring ITC Vegas,
 * discussing pilots/partnerships/collaboration) — this is FOUNDER
 * SELLING/BD activity for HIS OWN product to insurers, which must NOT be
 * misread as Saar being a BUYER of BPulse's software development services.
 * Relationship should land on a non-buyer / partner-shaped classification
 * (whichever the CommercialRelationship taxonomy supports — POTENTIAL_PARTNER
 * or similar), not POTENTIAL_BUYER, and definitely not force any onsite/
 * geographic remote barrier.
 *
 * DO NOT special-case "Saar", "SettWiz", or "Kobi Bendelak" anywhere in
 * application code. Fixes derived from this fixture must be general semantic
 * fixes: subject/authorship attribution for reposts, third-party-
 * organization-mention scoping, and employment-workplace-type vs
 * service-engagement-restriction separation.
 */
export const SAAR_MEENTS_SETTWIZ_RAW = `Saar Meents
· 3rd

Founder & CEO at SettWiz | Israeli windsurfing champion

Herzliya, Tel Aviv District, Israel

·

Contact info


SettWiz


Reichman University

500+

connections

Message

Follow

More
About
I'm the founder and CEO of Settwiz, an AI claims-handling platform for insurers and TPAs. I turn messy medical and legal data into clear, defensible settlement recommendations. Former Israeli national windsurfing champion, I bring a competitive, execution-first mindset to building products that cut cycle time and improve outcomes. Open to partnerships with carriers, TPAs, and advisors.

Top skills

Statistical Data Analysis • Customer Service • Negotiation • Artificial Intelligence (AI) • Machine Learning

Activity
2,255 followers


Follow

Posts

Comments

Images
View Saar Meents' profile
Saar Meents reposted this


View Kobi Bendelak's profile
Kobi Bendelak

 • 2nd

CEO at InsurTech israel

2w •

🇮🇱 Israeli InsurTech is coming to ITC Vegas 2026!
This year, InsurTech Israel is bringing to ITC a delegation of 12 innovative companies representing some of the most advanced AI and technology solutions shaping the future of insurance.
From underwriting, claims and fraud prevention to AI agents, customer intelligence, digital adoption, physical risk and entirely new categories of insurable risk — these companies are tackling real challenges across the insurance value chain.
Meet InsurTech Israel 2026 delegation:
Healthee | Notch | SettWiz | LepreCon Inc. | HearAI | ClearPass | ContentsPal | Toonimo | Encore AI | Cantaloupe | RAVIN.AI| Koladin ן Mastery AI l Varkle
If you're attending #ITC Vegas, come visit the #Israeli Pavilion, meet the founders and teams, see the technologies firsthand, and explore opportunities for pilots, partnerships and collaboration.🚀#ITCVegas #InsurTech #Insurance
#AI #InsuranceInnovation #IsraeliTech #InsurTechIsrael #ArtificialIntelligence #Innovation

View Saar Meents' profile
Saar Meents

  • 3rd+

Founder & CEO at SettWiz | Israeli windsurfing champion

1w •


AI demos are easy. Real claim files are not.

A clean 20-page example can make almost any AI product look impressive.

Then you meet the real world.

500 pages.
 Duplicate documents.
 Conflicting medical records.
 Missing information.
 Handwritten notes.
 Multiple parties.
 Different dates describing the same event.

Our conversation during the visit to EMC Insurance reinforced something we see again and again:

The real challenge in claims AI isn't generating a good answer.

It's maintaining accuracy when the underlying file is messy.

That's why so much of what we build at Settwiz happens before the final recommendation is ever generated.

Understanding the file. Structuring it. Cross-checking facts. Identifying contradictions. Knowing what is missing.

The output is only as good as everything that happened before it.

Thank you to the EMC team for having us in Des Moines.

SettWiz EMC Insurance Companies

#Claims #InsuranceTechnology #AI

View Saar Meents' profile
Saar Meents

  • 3rd+

Founder & CEO at SettWiz | Israeli windsurfing champion

2w • Edited •


When I started SETTWIZ, I kept hearing the same thing from people who had spent years in insurance:

"Insurance companies sometimes check how many times a startup has been to ITC before they decide to work with them."

Apparently, longevity matters in insurance :)

So I'm happy to say this is officially our first ITC Vegas.

And even better, we're coming as a sponsor.

Over the past year, we've spent a lot of time with insurers, claims teams, and industry leaders learning what it really takes to bring AI into claims operations. I'm excited to continue those conversations in Vegas and meet many more of you in person.

If you'll be at ITC, let's meet.

You can also save $200 on your ticket with our link:
https://lnkd.in/gCn8_yA6

Drop a 🖐️ if you're going.
#ITCVegas #Insurtech #Insurance #AI

View Saar Meents' profile
Saar Meents reposted this


View Saar Meents' profile
Saar Meents

  • 3rd+

Founder & CEO at SettWiz | Israeli windsurfing champion

2w • Edited •

The smartest AI system in the world is useless if the person making the decision doesn't trust it.
That was one of the things I kept thinking about after our visit with Principal Financial Group in Des Moines.

In insurance, giving someone an answer isn't enough.
The user needs to understand:

Why did the system reach this conclusion?
 Which documents support it?
 What facts are missing?
 What would change the recommendation?

That distinction is becoming increasingly important as AI moves from summarizing information to actually supporting decisions.

At Settwiz, we've become almost obsessive about this.

The goal isn't to replace professional judgment with a black box.
It's to give the person making the decision a much better view of the claim, while allowing them to inspect exactly how the system got there.

Thank you to the team at Principal for a great conversation and for hosting us in Des Moines.
SettWiz Principal Financial Group
#Insurance #AI #Claims

View Saar Meents' profile
Saar Meents

  • 3rd+

Founder & CEO at SettWiz | Israeli windsurfing champion

2w •


17 insurers. 4 cities. 4 days.

Des Moines. Omaha. Columbus. Cincinnati.

A few months ago, we had the opportunity to join an incredible U.S. InsurTech roadshow organized by Kobi Bendelak and InsurTech Israel, together with BrokerTech Ventures.

And just as valuable as the companies we met was the group we traveled with.

Nine Israeli startups, each approaching insurance from a completely different angle:

Canotera
GeoX.ai
Nolana AI
Maximizer AI
Miss Moneypenny Technologies
HearAI
Toonimo
LepreCon Inc.
and SettWiz

Four intense days of pitches, meetings, buses, flights, dinners and conversations with some of the largest and most established insurance organizations in the U.S.

We came expecting to spend most of our time talking about AI.

We ended up spending much more time talking about claims.

Where decisions slow down.
 Where experienced professionals spend time that doesn't require their judgment.
 Where important information gets buried inside hundreds of pages.
 And what actually needs to happen before AI becomes something an insurance company can rely on in production.

That was probably my biggest takeaway from the trip:

The interesting question is no longer whether AI can analyze an insurance claim. It can.

The harder question is whether you can make it reliable, explainable and operational enough that claims professionals actually want to use it every day.

A huge thank you to Kobi for putting this together, to everyone who hosted us across the Midwest, and to all the founders we got to share the experience with.

Over the next few weeks, I'll share a few of the conversations and ideas that stayed with me from each stop.

SettWiz

#Insurance #Claims #InsurTech

View Saar Meents' profile
Saar Meents reposted this


View Kobi Bendelak's profile
Kobi Bendelak

 • 2nd

CEO at InsurTech israel

3mo • Edited •

U.S. Roadshow | Day #2 – Omaha, Nebraska 🇺🇸
A fascinating day in Omaha meeting with leaders from Physicians Mutual, Mutual of Omaha Blue Cross and Blue Shield of Nebraska , WoodmenLife, Aflac, Ameritas, and the Nebraska Insurance Federation.
Together with Canotera, GeoX.ai, Nolana AI, SettWiz, Maximizer AI, Miss Moneypenny Technologies, HearAI, Toonimo, LepreCon Inc.,  we explored opportunities for collaboration and innovation across the insurance industry.
It's inspiring to see the openness to innovation and the potential for partnerships between the Nebraska insurance ecosystem and Israeli insurtech startups.
A special thank you to Select Greater Omaha Alec Gorynski, MPA Makayla Leiting for hosting such a high-quality gathering and to Itai Biran from the Israeli Consulate for helping make it happen.
#InsurTechIsrael #USRoadshow #Omaha #InsuranceInnovation #Insurtech

View Saar Meents' profile
Saar Meents reposted this


View Susan Hatten's profile
Susan Hatten

  • 3rd+

Chief Marketing Officer at Holmes Murphy & Associates

3mo •

Earlier this week our Holmes Murphy and BrokerTech Ventures teams had the opportunity to host a Delegation of Israeli Insurtech Startups — shining a spotlight on Des Moines, and our insurance-backed ecosystem.

Thank you, Kobi Bendelak, for your friendship, partnership, and visionary leadership over this remarkable program. A special thanks also to our distinguished guests, including Director Debi Durham and the IEDA Office, Commissioner Doug Ommen and the Iowa Insurance Division, David Miles the ManchesterStory team, and Itai Biran
with the Israeli Consulate of the Midwest.

Your support of our insurance industry is what has elevated the State of Iowa to #1 - as the insurance capital of America!

We look forward to the continued global collaborations with you all! 💥

View Saar Meents' profile
Saar Meents reposted this


View company: Discount Tech
Discount Tech

3mo •

New York, Mission Accomplished 🇮🇱🚀
As TECH WEEK by a16z comes to a close, we're taking a moment to reflect on what has been an extraordinary milestone for Discount Tech and IDB Bank.

Over the past week, thousands of founders, investors, operators, ecosystem leaders, and innovators gathered across New York City for a series of events, conversations, introductions, and opportunities that showcased the strength of the Israeli and American tech ecosystems.

Together with our incredible partners - Deloitte Catalyst, Greenberg Traurig, LLP, Israel Tech Mission, and many others - we welcomed an outstanding delegation of Israeli founders to New York and connected them with top-tier venture capital firms, investors, industry leaders, and some of the most influential voices in technology.

None of this happens by accident.

It takes months of planning, coordination, and commitment from teams who believe deeply in the power of connecting people and creating opportunities. To everyone who worked behind the scenes to make this mission possible: thank you.

Most importantly, thank you to our customers.

Thank you for trusting us throughout the year and allowing us to support your growth, not only through banking services, but through access, connections, and opportunities that help businesses scale globally.

At Discount Tech and IDB Bank, we believe founders deserve more than a bank account.

They deserve a banking partner that understands innovation, supports growth on both sides of the ocean, and helps open doors when it matters most.

Our vision is simple: to be the go-to banking partner for founders building between Israel and the United States - offering a seamless banking experience, deep ecosystem connections, and a community that helps entrepreneurs succeed.

The overwhelming feedback we've received this week, and the growing demand to join future Israel Founders Mission delegations, reinforces that we're building something that founders truly value.

This is only the beginning.

Thank you, New York. Thank you to our partners. Thank you to every founder, investor, and ecosystem leader who joined us.

See you at the next mission.
#NYTechWeek #IsraelFoundersMission
TECH WEEK by a16z

View Saar Meents' profile
Saar Meents

  • 3rd+

Founder & CEO at SettWiz | Israeli windsurfing champion

3mo •


Proud to be featured in Polisa Magazine, discussing how AI is reshaping the future of insurance.

At SettWiz, we believe the next generation of claims handling will be smarter, faster, and more consistent, combining deep domain expertise with AI-driven decision intelligence.

Our mission is to help insurers move from legacy, manual claims workflows to a unified decision layer that identifies risk, improves accuracy, and supports better outcomes for both insurers and policyholders.

A big thank you to Polisa for the feature and to the incredible people supporting our journey.

#Insurtech #AI #Insurance #Claims #SettWiz

Experience
SettWiz logo
Founder & CEO

SettWiz · Full-time

Apr 2024 - Present · 2 yrs 6 mos

Israel · Hybrid

Settwiz uses a unique AI-driven approach to transform insurance claim departments, streamlining processes and optimizing efficiency.

rosen&meents logo
Operations Manager

rosen&meents · Full-time

Nov 2020 - Nov 2022 · 2 yrs 1 mo

Israel · On-site

I managed the watersport department, representing 1.5% of the network, including two surf shops in Israel. Under my leadership, a new branch was opened, achieving profitability within the first year. I also introduced brands like KT and MFC from Hawaii and built a team to promote them.

 Export-Import problem solving, Customer Service and +1 skill

meents foil club logo
Co-Founder

meents foil club · Full-time

Mar 2020 - Aug 2021 · 1 yr 6 mos

Israel · On-site

I developed a unique hydrofoiling teaching platform and founded Israel's first foil school in partnership with Bnei Herzliya Sailing Club. To date, we've brought 500 clients into the world of hydrofoiling, expanding the sport's reach.

 Teaching and Training

International Olympic Committee – IOC logo
Athlete

International Olympic Committee – IOC · Full-time

Jan 2016 - Mar 2020 · 4 yrs 3 mos

Israel

Contender for the sole qualifying spot to represent Israel in windsurfing at the Tokyo 2020 Olympic Games. While I did not ultimately secure the position, I had the honor of competing on behalf of Israel in numerous World and European Championships, demonstrating resilience, dedication, and elite performance on the international stage.

Israel Defense Forces logo
Excellent athlete

Israel Defense Forces · Full-time

Feb 2017 - Oct 2019 · 2 yrs 9 mos`
