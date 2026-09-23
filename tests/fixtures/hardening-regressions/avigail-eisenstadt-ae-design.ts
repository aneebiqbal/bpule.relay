/**
 * Hardening regression fixture — Avigail Eisenstadt / AE Design Group.
 *
 * Avigail is an interior designer / EMT nonprofit COO — there is NO
 * software-buying need anywhere in evidence. Correct result: no current
 * software-buying need, intent UNKNOWN, no fabricated opportunity, no
 * message recommended — this part of current behavior is ALREADY CORRECT
 * and must not regress (do not increase her score or intent).
 *
 * The bug is purely in labeling: current output says "Remote eligibility
 * unclear: No workplace information — cannot determine eligibility" — WRONG
 * because there is no employment/location-constrained opportunity in
 * evidence AT ALL, so remote eligibility should be NOT_APPLICABLE ("No
 * employment or location-constrained engagement opportunity detected"), not
 * UNKNOWN/UNCLEAR. UNCLEAR/UNKNOWN should only be used when an actual
 * relevant opportunity exists but geographic evidence is missing.
 *
 * Also verify no "Probably skip" + contradictory action, and that "Has a
 * credible Revenue Identity for this opportunity" (if it appears) doesn't
 * contradict "No clear opportunity signal detected" — reword per Bug 4.
 *
 * DO NOT special-case "Avigail", "AE Design Group", or any wording from this
 * profile anywhere in application code. Fixes derived from this fixture must
 * be general (remote-eligibility NOT_APPLICABLE-vs-UNCLEAR classification,
 * verdict/action reconciliation, Revenue Identity wording).
 */
export const AVIGAIL_EISENSTADT_AE_DESIGN_RAW = `Avigail Eisenstadt
· 2nd

CEO, Founder & Principal Interior Designer at AE Design Group, LLC, WBE Certified, NREMT

Inwood, New York, United States

·

Contact info


AE Design Group LLC


New York School of Interior Design

38,568 followers



Avi and Oren are mutual connections


Follow
Message
Visit my website

More
Profile enhanced with Premium

About
Avigail Eisenstadt leads complex work across design, operations, and community, bringing clarity, judgment, and follow-through to everything she takes on.

She is the Founder and CEO of AE Design Group, a WMBE-certified interior design firm delivering refined, purposeful interiors across the healthcare, hospitality, commercial, educational, and multi-family sectors. With over 15 years of experience and a broad portfolio of completed projects, Avigail brings a sharp eye and steady hand to every phase of design — from concept through completion — ensuring work that is practical, durable, and grounded in real-world constraints.

In addition to AE Design Group, she leads Design Source Group, a procurement and logistics company specializing in FF&E purchasing for construction and renovation projects. Through close vendor relationships and deep industry knowledge, she helps clients move projects forward efficiently while maintaining quality, budget discipline, and design integrity.

Beyond the world of design, Avigail serves as Chief Operating Officer of Hatzolah Air, a global air ambulance nonprofit coordinating life-saving emergency rescue missions. She is also a Nationally Registered EMT, bringing operational insight, composure, and clear decision-making to high-stakes situations.

At home in Manhattan Beach, she is married to Rav Akiva Eisenstadt, the rabbi of the community and a widely respected leader and teacher. Together, they are raising their five children in a home deeply rooted in community life.

Services
Interior Design

Activity
38,568 followers

Experience
AE Design Group LLC logo
CEO, Founder & Principal Interior Designer

AE Design Group LLC

Dec 2010 - Present · 15 yrs 10 mos

Hatzolah Emergency Air Response Team logo
Chief Operating Officer, NREMT

Hatzolah Emergency Air Response Team

Aug 2020 - Present · 6 yrs 2 mos

 U.S. National Registry of Emergency Medical Technicians (NREMT) and Emergency Medical Services (EMS)

Design Source Group logo
Chief Executive Officer

Design Source Group

Feb 2017 - Present · 9 yrs 8 mos

Interior Designer

Bridgeport 123 Construction, Corp.

Jan 2011 - Jul 2012 · 1 yr 7 mos

Upscale Healthcare Design

Center Management Group logo
Design & Project Management

Center Management Group

Dec 2010 - Jul 2012 · 1 yr 8 mos

Upscale Healthcare Design

Education
New York School of Interior Design logo
New York School of Interior Design

AAS, Interior Design

2005 – 2010

Beth Jacob Lucerne, Switzerland

2000 – 2001`
