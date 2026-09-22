/**
 * Hardening regression fixture — Daria Redkina / Solsonic
 *
 * Real user-supplied raw source (exact text, unmodified). Added during the
 * Relay production hardening sprint as a permanent regression fixture after
 * a reported case of incorrect pipeline coupling between email preparation
 * and email sending, an empty LinkedIn connection note despite a
 * CONNECT_OR_OBSERVE action, and a cross-surface messaging-policy
 * contradiction (Lead Intelligence vs Lead Detail).
 *
 * DO NOT special-case "Daria", "Solsonic", or any wording from this profile
 * anywhere in application code. Fixes derived from this fixture must be
 * general architectural fixes (shared service/policy layer), verified by
 * running this fixture, not fixes that pattern-match this specific text.
 */
export const DARIA_REDKINA_SOLSONIC_RAW = `Daria Redkina
· 3rd
founder of Solsonic , Green Tech , Sound Design, Audio Communications, EduTech
Berlin, Germany
·
Contact info
svg
Freelance
image
Universität der Künste Berlin
30
connections
svgMessage
svg
Follow
More

About
As a sound artist and parent, I design creative tools that inspire interactive ecological curiosity in children. My work sits at the intersection of Audio, EduTech, and Green Tech—combining sound design and sustainability to make learning intuitive and hands-on.
Following years of independent work as an instrument designer and composer for theater and choreography, I launched Solsonic in 2025: an art installation turned solar-powered educational synthesizer.
Backed by the EXIST Women scholarship, I am scaling Solsonic into a hardware startup.

Activity
30 followers
svg
Follow

Posts
Comments
Images

View Daria Redkina's profile
(image)
Daria Redkina
 • 3rd+
founder of Solsonic , Green Tech , Sound Design, Audio Communications, EduTech
2w • Visibility: Global
svg
Solsonic.de is now viral! Huge thank you to my talented team members who helped the website come to life!

Graphic design , animation , visualisation Lena Pozdnyakova 🪲
UI/UX, webdesign Barry Despenza 🧩
Curation, concept Daria Redkina 🔋

https://solsonic.de
… more
View image
(image)
1/2
svg
svg
5 reactions5
1 comment1 comment
•
1 repost1 repost
svgLike
svg
svg
Comment
svg
Repost
svg
Send

View Daria Redkina's profile
(image)
Daria Redkina
 • 3rd+
founder of Solsonic , Green Tech , Sound Design, Audio Communications, EduTech
6mo • Visibility: Global
svg
So honored to be part of this program for the upcoming months! Thank you Sigrid Reede and Jörn Krug from Film Uni Babelsberg for the mentorship !… more
View company: Startup Center Film University Babelsberg
(image)
Startup Center Film University Babelsberg
6mo • Edited • Visibility: Global

Happy International Women's Day! 🌸🎉

🥳 We are excited to announce the winners of the NOISE* EXIST-Women Scholarship at Filmuniversität Babelsberg KONRAD WOLF! Thanks to EXIST – Existenzgründungen aus der Wissenschaft and the generous support from BMWK and ESF, we are proud to welcome these inspiring FLINTA* entrepreneurs into our NOISE* community:

🎥 Kasia Suchecka
🎨 Daria Redkina
🎶 Sophie Alexandra Bunge
💻 Imogen Lea Drews
🧬 Sara Luna Ruiz Montoya
🎬 Viktoria Hilsberg
🌍 Júnia Matsuura
🚀 Yara Khalil
📚 Carolin Hauke
✨ Lina Zacher

These talents are shaping the future of entrepreneurship. We can't wait to see their innovative projects thrive! 💪

Whether you're part of the scholarship or just starting your entrepreneurial journey, NOISE* is a community for all FLINTA* entrepreneurs. Join us at our upcoming events and make some NOISE* together!

🔗 Learn more about NOISE* and our events:
https://lnkd.in/dMRgHCQu

#womeninbusiness #innovation #entrepreneurship #happywomensday #community… more
View image
(image)
svg
svg
5 reactions5
1 repost1 repost
svgLike
svg
svg
Comment
svg
Repost
svg
Send

View Daria Redkina's profile
(image)
Daria Redkina
 • 3rd+
founder of Solsonic , Green Tech , Sound Design, Audio Communications, EduTech
8mo • Visibility: Global
svg
I'm happy to share that I've completed my Master of Arts - MA at Universität der Künste Berlin!
View celebration image
(image)
Celebrating an educational milestone
svg
2 reactions2
svgLike
svg
svg
Comment
svg
Repost
svg
Send
svg
svgShow all

Experience
Freelance logo
Composer
Freelance · Freelance
Jun 2020 - Present · 6 yrs 4 mos
Berlin, Germany
sound design for theatre and choreography
svg Music Pedagogy and Curatorial Projects

ARMA Records logo
Music Producer
ARMA Records · Freelance
Jan 2026

Education
Universität der Künste Berlin logo
(image)
Universität der Künste Berlin
Master of Arts - MA, Sound Studies and Sonic Arts
Oct 2020 – Jul 2025

London Metropolitan University logo
(image)
London Metropolitan University
Bachelor of Arts - BA, Sound and Media
Sep 2005 – Sep 2008

Skills
Music Pedagogy
svg
Composer at Freelance
Curatorial Projects
svg
Composer at Freelance

Interests
Companies
Newsletters
Schools
image
Entrepreneurs Catalyst Hub, CompanyEntrepreneurs Catalyst Hub
15,660 followers
(image)
svg
Follow
image
JUNI, CompanyJUNI
6,383 followers
(image)
svg
Follow`

/**
 * Reported symptoms against this fixture (as observed by the user before
 * any fix — kept here for traceability, not as assertions; the actual
 * regression tests live in tests/hardening-regression-daria.test.ts):
 *
 * - Intelligence completes; relationship/action resolves to CONNECT_OR_OBSERVE
 * - Email strategy is generated
 * - Inferred contact daria.redkina@solsonic.de correctly marked
 *   INFERRED_PATTERN, 35% confidence, correctly NOT treated as verified/sendable
 * - BUT subject and body remain EMPTY — UI shows "No business email is
 *   available yet. Add or discover a contact point first."
 *   => incorrect coupling of CAN_PREPARE_EMAIL to CAN_SEND_EMAIL.
 * - LinkedIn connection note shows 0/300, "No note generated."
 * - Lead Intelligence says "CONNECT OR OBSERVE / Send a short connection
 *   note" while Lead Detail says "No message — Change is not an invitation.
 *   Connect or observe; do not force a DM." — presented as contradictory
 *   even if semantically reconcilable.
 * - Displayed "9 out of 12 — Good" / "Scored 9/12 — not eligible for
 *   drafting" against a canonical score of 47 — need to confirm whether the
 *   legacy /12 score is independently gating drafting for a post-canonical
 *   lead (it must not).
 * - Quality issue: "Company growth indicates potential need" overstates the
 *   evidence — the source supports "scaling into a hardware startup" as a
 *   change/growth signal, not a software-services buying need. Evidence vs.
 *   inference must stay distinguished in generated reasoning.
 */
