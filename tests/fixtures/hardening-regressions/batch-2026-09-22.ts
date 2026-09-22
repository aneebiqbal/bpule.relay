/**
 * Hardening regression fixtures — batch dump, 2026-09-22.
 *
 * Real user-supplied raw LinkedIn sources + the Relay output the user
 * observed for each at the time, captured verbatim for later investigation.
 * These were supplied as a bulk drop (no explicit bug report attached to
 * each individual one) — treat the "REPORTED OUTPUT" comments as data about
 * what Relay produced, not as assertions that the output is wrong. Some may
 * turn out to be correct; some may not. A dedicated investigation pass
 * should look at each before drawing conclusions.
 *
 * The user's own message was truncated at 50,000 characters by the
 * transport — Halil GUR's profile is the last complete entry; anything
 * after it in the original message may be missing here. Confirm with the
 * user whether more fixtures need to be captured before treating this batch
 * as complete.
 *
 * DO NOT special-case any name/company from these fixtures anywhere in
 * application code.
 */

export const ALI_GUENAYDIN_MOOD_BURGER_RAW = `Ali Günaydin
CEO & Founder at The Mood Burger · The Mood Burger

Ali Günaydin
· 3rd

CEO & Founder at The Mood Burger | Franchise Expansion | Real Estate

Germany

·

Contact info

The Mood Burger


Hochschule für Technik und Wirtschaft Berlin

293

connections

Message

Follow

More
Activity
317 followers


Follow

Posts

Comments

Videos

Images
View Ali Günaydin's profile
Ali Günaydin

  • 3rd+

CEO & Founder at The Mood Burger | Franchise Expansion | Real Estate

2w •


🚀 THE MOOD BURGER GEHT AUF EXPANSIONSKURS – DEUTSCHLANDWEIT! 🍔🇩🇪

Seit 2021 ist The Mood Burger erfolgreich am Markt. Mit inzwischen 10 Filialen in Berlin, jährlichen Millionenumsätzen und einer starken Marke im Burger- und Gastronomiebereich sind wir bereit für den nächsten Schritt.

Unser Ziel: The Mood Burger in den großen Städten Deutschlands etablieren.

Dafür suchen wir keine beliebigen Gastronomieflächen, sondern Standorte, die wirklich zu unserer Marke passen: Top-Lagen, hohe Frequenz, starke Sichtbarkeit und ein Umfeld mit langfristigem Potenzial.

Besonders interessant sind aktuell:

Hamburg · München · Hannover · Leipzig · Nürnberg

Auch für weitere attraktive Standorte in Deutschland sind wir offen.

Was wir suchen:

▪️ Gastronomieflächen in 1A-Lagen
▪️ Hohe Kundenfrequenz und gute Sichtbarkeit
▪️ Etablierte Innenstadt- und Highstreet-Lagen
▪️ Geeignete Flächengrößen und gute gastronomische Voraussetzungen
▪️ Langfristige Mietverhältnisse und nachhaltige Partnerschaften

Was wir als Mieter mitbringen:

Langfristigkeit, Verlässlichkeit, Bonität, Erfahrung und gute Zahlen.

Seit 2021 haben wir unser Unternehmen kontinuierlich aufgebaut und betreiben heute bereits 10 Filialen in Berlin. Unsere wirtschaftliche Entwicklung und unsere Umsätze bieten die solide Grundlage, die Eigentümer von einem starken und zuverlässigen Gastronomiemieter erwarten.

Wir suchen ausdrücklich langfristige Mietverträge und möchten gemeinsam mit Eigentümern, Maklern und Projektentwicklern nachhaltige Standorte entwickeln.

Die Herausforderung: Viele gute Flächen werden bereits off-market vergeben, bevor sie überhaupt öffentlich angeboten werden. Gleichzeitig sind hohe Ablösesummen für bestehende Gastronomieflächen nicht immer wirtschaftlich sinnvoll.

Deshalb sagen wir es direkt:

Wir sind bereit. Wir sind ready.

Jetzt suchen wir die richtigen Flächen und die richtigen Partner.

👉 Eigentümer, Makler und Projektentwickler:

Wenn Sie eine Gastronomiefläche in starker Lage haben und diese langfristig an einen etablierten, bonitätsstarken Betreiber vermieten möchten, freuen wir uns auf Ihre Nachricht.

Vielleicht wird aus Ihrer Gewerbefläche der nächste The Mood Burger Shop. 🍔🔥

#TheMoodBurger #Expansion #ExpansionDeutschland #Gastronomie #Gastronomieimmobilien #Gastronomieflächen #RetailRealEstate #Highstreet #Immobilien #Standortentwicklung #FoodAndBeverage #Restaurant #Burger #Hamburg #München #Hannover #Leipzig #Nürnberg #Berlin #Deutschland

View Ali Günaydin's profile
Ali Günaydin

  • 3rd+

CEO & Founder at The Mood Burger | Franchise Expansion | Real Estate

1mo •


The Mood Burger Die Zukunft schmeckt nach Wachstum. 🍔🚀

Was als Vision begann, entwickelt sich zu einer starken Bewegung.

Unsere The Mood Burger-Familie wächst kontinuierlich. Bereits heute zählen wir über 200 festangestellte Mitarbeitende und haben mehr als 200 Jobanfragen erhalten. Das bestätigt uns: Wir schaffen nicht nur Arbeitsplätze wir bauen eine Marke mit Zukunft.

Unser Fokus für die nächsten 5 jahre ist klar definiert:
📍 Ausbau unseres Netzwerks in ganz Deutschland.
🌍 Internationale Expansion in unsere Nachbarländer:
🇵🇱 Polen
🇳🇱 Niederlande
🇦🇹 Österreich

Experience
Founder & Gründer bei The Mood Burger,Keb'up Mood

The Mood Burger

Jun 2021 - Present · 5 yrs 4 mos

Berlin, Germany

Franchising

Education
Hochschule für Technik und Wirtschaft Berlin logo
Hochschule für Technik und Wirtschaft Berlin

Bachelor, Immobilienwirtschaft

2018 – 2021

Grade: 1.7

Skills
Franchising`

/**
 * REPORTED OUTPUT (Ali Günaydin):
 * Fit HIGH / Intent HIGH / Confidence HIGH / Act CONTACT NOW
 * Reasons shown: "A current problem is in evidence. Confirm relevance; do
 * not diagnose from scrape. Use: Over 200 job inquiries received. Send a
 * short connection note — earn access only", "Company growth indicates
 * potential need.", "Immediate need detected.", "Has a credible Revenue
 * Identity for this opportunity.", "Immediate timing signal.",
 * "Non-technical micro business — unlikely to need software development",
 * "Remote eligibility unclear...", "No verified proof for this specific
 * opportunity."
 *
 * NOTE: this profile is a burger restaurant franchise CEO seeking
 * commercial real estate (Gastronomieflächen) for physical restaurant
 * expansion — explicitly NOT a software/development need. The "200 job
 * inquiries" is about restaurant staffing applications, not a technical
 * hiring signal. Also notably: "Non-technical micro business" watchOut
 * fired AND fit=HIGH/act=CONTACT NOW fired simultaneously — an internal
 * contradiction worth checking (a business correctly flagged as a
 * non-technical micro-business should not also be a HIGH-fit CONTACT NOW).
 */

export const KEREM_OBA_CAPITAL_EVENTS_RAW = `Kerem Oba
· 2nd

Founder and General Manager at Capital Events

Beykoz, Istanbul, Türkiye

·

Contact info


Capital Events Türkiye


Orta Doğu Teknik Üniversitesi / Middle East Technical University

500+

connections

Connect
Message

More
About
Experienced General Manager with a demonstrated history of working in the events services industry. Skilled in Marketing Management, Budgeting, Business Planning, Operations Management, and Entrepreneurship. Strong entrepreneurship professional with a BS focused in Management from Orta Doğu Teknik Üniversitesi / Middle East Technical University.

Activity
5,767 followers


Follow

Experience
Capital Events Türkiye logo
Founder / General Manager

Capital Events Türkiye

Owner

Bilkent University logo
Part Time Instructor for Department of Tourism and Hotel Management

Bilkent University

Sep 1991 - Jun 1998 · 6 yrs 10 mos

Türkiye

General Coordinator

OYAK Pazarlama Hizmet ve Turizm A.S

1991 – 1997

Bursa, Türkiye

Account Executive

BodrumTour Tourism Company - Kavala Group

1990 – 1991

Bursa, Türkiye

Education
Orta Doğu Teknik Üniversitesi / Middle East Technical University logo
Orta Doğu Teknik Üniversitesi / Middle East Technical University

BS, Management

1984 – 1990`

/**
 * REPORTED OUTPUT (Kerem Oba):
 * Fit MEDIUM / Intent UNKNOWN / Confidence HIGH / Act CONNECT OR OBSERVE
 * "No message recommended. No current reason to message. Connect or wait."
 * Message composer shown: "0 / 300 — No note generated."
 * (Events/hospitality industry — plausible correct MEDIUM/UNKNOWN result;
 * the notable issue is the SAME empty-note symptom as Daria/Mehmet Ali —
 * see below — not necessarily a scoring error.)
 */

export const MEHMET_ALI_UENVER_BENTEGO_RAW = `Mehmet Ali Ünver
· 2nd

CEO at Bentego

Istanbul, Türkiye

·

Contact info


Bentego


Orta Doğu Teknik Üniversitesi / Middle East Technical University

500+

connections

Connect
Message

More
About
With over 30 years of leadership experience across global technology, telecommunications, and data-driven organizations, I specialize in transforming companies through innovation, digital intelligence, and operational excellence. My career journey — from engineering and network optimization to C-level strategy — has been defined by a constant pursuit of measurable impact and sustainable growth.

As CEO of Bentego, I focus on building a business that turns data into strategic capital. My approach combines analytical precision with marketing vision — empowering organizations to understand their data, unlock hidden value, and design smarter, more responsive customer experiences. I believe that technology leadership today means not only mastering data and AI, but also translating them into long-term business value.

Activity
1,576 followers


Follow

Experience
Bentego logo
CEO

Bentego · Full-time

Jan 2025 - Present · 1 yr 9 mos

Istanbul, Türkiye · On-site

We add value from data.
*Leading Bentego's vision to transform data into strategic business value through advanced analytics, AI, and automation.
* Overseeing company-wide strategy, growth, and innovation across Big Data, AI/ML, Intelligent Document Processing (IDP), AI Governance & Security, Event & Action Management, and Marketing Operations.
* Expanding Bentego's service portfolio and establishing strategic partnerships to strengthen its position as a regional leader in Big Data and AI consulting.
* Driving the development of real-time data architectures and AI governance frameworks to ensure scalability, compliance, and security for enterprise clients.
* Guiding cross-functional teams to deliver data monetization strategies and customer-centric analytics solutions for clients in banking, telecommunications, and manufacturing sectors.
* Fostering a culture of innovation that integrates technology, marketing, and creativity to achieve measurable business impact.
* Championing Bentego's mission — "We add value from data" — by aligning data-driven insights with strategic decision-making and long-term growth.

Erciyes Anadolu Holding logo
Group CIO

Erciyes Anadolu Holding · Full-time

Sep 2021 - Dec 2024 · 3 yrs 4 mos

Istanbul, Türkiye · On-site

* Directly reporting to Group CEO.
* Managing IT department of Holding & 22 Group companies (more than 300+ people) in 8 different sector.
* Owning & Leading Digital Transformation at entire Holding and group companies like;
   - SaaS, Cloud Strategy and Migrations
   - All SAP Module (FI, SD, MM, CO, WM, PP etc.) Integrations and S4 HANA upgrades, ABAP developments, SAP with Rise transformation strategy
    - Implemention of RPA Solution (Robotic Process Automation)
    - Implementing of Generative AI solutions, IoT and AR/VR Applications
    - Developing of Mobile/WEB Applications
    - Industry 4.0 Strategy for the factories, pLTE solutions, Dark factory approach
    - Implementing and managing of E-Commerce and Marketplace platforms (Ideasoft, Akinon & SAP Hybris)
    - Arranging Technology Events with Ecosystem partners to increase the awareness at entire Holding
* Restructuring of IT/OT Architecture and Topology
     -Micro Service Architecture
     -Containerization
     -DevSecOps Approach
     -Business Continuity Management & Disaster Recovery
      -ZTNA Approach
     -SOC (Security Operation Center) as SaaS
     -BI & DW and Data Lake Platforms
     -Big Data Management, Data Lake
     -Renewal of SCADA Management platforms
* Operation of Information and Cyber Security, GDPR

Celebi Aviation logo
Global Quality Director

Celebi Aviation · Full-time

Apr 2017 - Sep 2021 · 4 yrs 6 mos

Istanbul, Türkiye · On-site

Turk Telekom logo
Group Technology Assurance & PMO Director

Turk Telekom · Full-time

Mar 2015 - Dec 2016 · 1 yr 10 mos

Istanbul, Türkiye · On-site

Education
Orta Doğu Teknik Üniversitesi / Middle East Technical University logo
Orta Doğu Teknik Üniversitesi / Middle East Technical University

Master of Science - MS, Electrical and Electronics Engineering

Sep 1993 – Jan 1997`

/**
 * REPORTED OUTPUT (Mehmet Ali Ünver):
 * Fit MEDIUM / Intent UNKNOWN / Confidence HIGH / Act CONNECT OR OBSERVE
 * "A relevant change exists, but they have not asked for help. Use: Remote
 * eligibility: On-site requirement detected in text. Send a short
 * connection note — earn access only"
 * Connection note composer shown: "0 / 300 — No note generated."
 *
 * NOTE: this is the clearest repeat of the exact bug pattern described in
 * the Daria Redkina fixture — CONNECT_OR_OBSERVE / "Send a short connection
 * note" recommended in the reasoning, but the note composer is empty with
 * "No note generated." Also: "Remote eligibility: On-site requirement
 * detected in text" is being surfaced as a REASON TO CONTACT (part of the
 * "Use:" suggested talking point), which conflates a job-posting-style
 * remote-eligibility field with this person's own individual profile — this
 * person is a CEO, not a job posting; there is no "on-site requirement" in
 * any employer-imposed sense for a CEO's own LinkedIn profile. Worth
 * tracing where that eligibility evidence is coming from and whether it's
 * being misattributed as personalization material.
 */

export const HALIL_GUR_ALPHA_TEKNOLOJI_RAW = `Halil GUR
· 2nd

Co-Founder, Head of R&D Software @ Alpha Teknoloji | Business Development, R&D

Ankara, Türkiye

·

Contact info


Alpha Teknoloji Danışmanlık Elektronik Yazılım Ltd. Sti.


Orta Doğu Teknik Üniversitesi / Middle East Technical University

287

connections

Connect
Message

More
About
Alpha Teknoloji Danışmanlık Elektronik Yazılım Ltd. Sti. benefits from the leadership and technical expertise of their Co-Founder and Head of R&D Software, a Middle East Technical University graduate with a Bachelor's degree in Computer Engineering. With a strong foundation in business development, research and development, and product development, they play a critical role in driving innovation and delivering impactful software solutions. Their work focuses on combining technical proficiency with strategic insights to foster growth and advancement.

Activity
287 followers


Follow

Posts

View Halil GUR's profile
Halil GUR reposted this

View company: Alpha Teknoloji Danışmanlık Elektronik Yazılım Ltd. Sti.
Alpha Teknoloji Danışmanlık Elektronik Yazılım Ltd. Sti.

Visit website

3w •

We're proud to have our article, "Between Hot Kiln Surveys," featured in Global Cement Magazine.

It appears in the September 2026 issue and discusses how routine mechanical measurements can help cement plants detect changes earlier and support better maintenance decisions.

#CementIndustry #RotaryKiln #RotaryDryer #KilnMaintenance #AlphaTeknoloji #GlobalCement #MMD

View Halil GUR's profile
Halil GUR

  • 2nd

Co-Founder, Head of R&D Software @ Alpha Teknoloji | Business Development, R&D

4mo •


This is exactly why we focus on repeatable measurement rather than one-time manual checks. When migration data is collected consistently and paired with shell temperature, it becomes a predictive maintenance tool not just an inspection result.

View company: Alpha Teknoloji Danışmanlık Elektronik Yazılım Ltd. Sti.
Alpha Teknoloji Danışmanlık Elektronik Yazılım Ltd. Sti.

Visit website

4mo •

The cheapest insurance policy in your cement plant is also the one most plants don't buy.

It's called tyre migration measurement — and it takes just a few minutes.
Tyre migration (or "creep") is the small, controlled slip between the kiln shell and its riding ring, measured in millimetres per revolution.

At Alpha Teknoloji, our MMD (Multi Measurement Device) replaces chalk-and-tape with fast, repeatable, operator-independent measurement — so the number you record today can actually be compared with the one from last campaign.

#RotaryKiln #CementIndustry #PredictiveMaintenance #KilnAlignment #IndustrialMeasurement #MMD #Alphateknoloji

Experience
Alpha Teknoloji Danışmanlık Elektronik Yazılım Ltd. Sti. logo
Co-Founder, Head of R&D Software

Alpha Teknoloji Danışmanlık Elektronik Yazılım Ltd. Sti.

Research and Development (R&D), Business Development and +6 skills

Education
Orta Doğu Teknik Üniversitesi / Middle East Technical University logo
Orta Doğu Teknik Üniversitesi / Middle East Technical University

Bachelor's degree, Computer Engineering

Oct 2002 – May 2008

Skills (8)
Business Development
Research and Development (R&D)`

/**
 * REPORTED OUTPUT (Halil GUR):
 * Fit MEDIUM / Intent UNKNOWN / Confidence HIGH / Act CONNECT OR OBSERVE
 * "A relevant change exists, but they have not asked for help. Use: Yet the
 * standard practice is still chalk + tape, once a year, by a contractor —
 * operator-...". Send a short connection...
 * (message was truncated here by the transport at 50,000 characters —
 * remainder of Halil GUR's reported output and any fixtures after him in
 * the original message were not captured. Confirm with the user whether
 * more needs to be added.)
 */
