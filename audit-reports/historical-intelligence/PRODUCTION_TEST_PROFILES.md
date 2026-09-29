# Relay Intelligence — Production Test Profiles

Paste these into the Prospect Analyzer or "New Lead" to verify behavior.

---

## 🟢 SHOULD SCORE HIGH (genuine buyers)

### H1: Explicit project ask
```
Marcus Weber
CEO at Klar

About
Klar is the neobank for German-speaking Europe. We need experienced teams who can help us rebuild our lending infrastructure. Contract/freelance OK. Must overlap with CET.

Posts
"Looking for a strong engineering team to help us scale our lending platform. Remote possible for strong teams. CET overlap required."

linkedin.com/in/marcusweber
klar.com
```
**Expected:** Score 55-80, intent HIGH, CONNECT WITH NOTE

---

### H2: Capacity crunch + explicit need
```
James Okonkwo
Founder & CEO at AfriPay

About
AfriPay processes payments across 15 African countries. We're expanding fast and can't keep up with our roadmap. Looking for a remote engineering team to help build our v2 mobile wallet.

Posts
"We need a strong React Native + Node.js team to help us build our mobile wallet. Worldwide remote."

linkedin.com/in/jamesokonkwo
afripay.com
```
**Expected:** Score 60-85, intent HIGH, CONNECT WITH NOTE

---

### H3: Tried agencies before + specific tech need
```
Emily Torres
Head of Product at Wellbeing Medical

About
We need a team to help us build our next-gen patient portal. We've tried two agencies before — neither delivered. React, TypeScript, Node.js. Must understand HIPAA. Remote-first.

Posts
"Looking for a development partner who can take ownership of our patient portal build. Remote OK. Must understand HIPAA compliance."

linkedin.com/in/emilytorres
wellbeingmedical.com
```
**Expected:** Score 65-85, intent HIGH, CONNECT WITH NOTE

---

### H4: Migration/rebuild with explicit ask
```
David Park
CTO at LogisticsOS

About
We're rebuilding our entire order management platform from scratch. Looking for a team with React/Node.js experience who can embed with us for 6 months. Remote worldwide.

Posts
"We're migrating our legacy platform. Need a team who owns the full stack — React, Node.js, PostgreSQL. Remote worldwide."

linkedin.com/in/davidpark
logisticsos.com
```
**Expected:** Score 50-75, intent HIGH, CONNECT WITH NOTE

---

### H5: Freelance project with budget
```
Lisa Chen
VP Product atFinFlow

About
FinFlow is building a new invoice automation feature. We need a freelance fullstack team for a 3-month project. Budget $15k-$25k/month. React + Node.js.

Posts
"Looking for a freelance React/Node.js team for a 3-month project. Budget is committed. Remote OK."

linkedin.com/in/lisachen
finflow.io
```
**Expected:** Score 60-80, intent HIGH, CONNECT WITH NOTE

---

## 🟡 SHOULD SCORE LOW-MEDIUM (hiring for own team)

### M1: Director hiring senior engineer
```
Nicholas Miller
Director of Engineering, Qualia

About
Focused on creating great software through solid architecture. Hiring: Senior Software Engineer I. Remote.

Posts
"Excited to be growing our engineering team. We're looking for senior engineers who want to build with us."

linkedin.com/in/nicholaslinkedin.com
qualia.com
```
**Expected:** Score < 50, intent MEDIUM/UNKNOWN, CONNECT WITHOUT NOTE

---

### M2: CTO hiring (small startup)
```
Alex Rivera
CTO & Co-founder at DataPulse

About
DataPulse helps marketers automate reporting. We're hiring our first senior fullstack engineer. React, Node.js, Python. Remote-friendly.

Posts
"DataPulse is hiring! Looking for a senior fullstack engineer to join our small team. Remote-first."

linkedin.com/in/alexrivera
datapulse.io
```
**Expected:** Score < 45, intent MEDIUM, CONNECT WITHOUT NOTE

---

### M3: Engineering manager hiring multiple roles
```
Rachel Kim
VP Engineering at GrowthLab

About
Scaling our engineering team from 5 to 15. Hiring senior backend, frontend, and fullstack engineers. Remote OK.

Posts
"We're hiring across the board. If you're a strong React or Node.js engineer, let's talk."

linkedin.com/in/rachelki
growthlab.io
```
**Expected:** Score < 40, intent MEDIUM, CONNECT WITHOUT NOTE

---

### M4: Hiring but decision maker thin
```
Jordan Lee
Head of Engineering

About
Hiring senior engineers. Remote. React, TypeScript, Node.js. Building the future of fintech.

Posts
"Team is growing. Looking for engineers who want to make an impact."
```
**Expected:** Score < 35, intent UNKNOWN, CONNECT WITHOUT NOTE

---

## 🔴 SHOULD SCORE NEAR ZERO (service providers / competitors)

### S1: Fractional CTO offering services
```
Michel Borges
CEO, Cloud2Gether | Fractional CTO and Cloud Strategy Leader

About
I am a Fractional CTO and Cloud Strategy Leader with 15+ years designing cloud-native platforms. I partner with companies looking to accelerate cloud adoption. I help startups scale.

linkedin.com/in/michelmob
cloud2gether.com
```
**Expected:** Score < 10, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### S2: Software development agency
```
Adil Mahmood
Co-founder & Director, Code Graphers

About
Co-founder & Director of CodeGraphers. We build scalable software solutions for businesses. Services: Mobile App Development, Cloud Development, Custom Software, SaaS Development, Web Development.

Services
Custom Software Development, Mobile Application Development, SaaS Development, Web Development

linkedin.com/in/adilmahmood
codegraphers.com
```
**Expected:** Score < 10, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### S3: Freelance developer offering services
```
Chris Anderson
Senior Fullstack Engineer | React • Node.js • TypeScript

About
I help startups build MVPs and scale their platforms. 8+ years experience. Currently available for freelance engagements. Remote worldwide.

Posts
"Just finished a React/Node.js project for a fintech startup. Available for new engagements starting next month."

linkedin.com/in/chrisanderson
```
**Expected:** Score < 15, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### S4: DevOps consultant
```
Hassan Saulat
Senior DevOps Engineer | AWS | Kubernetes | Terraform

About
I help companies streamline their infrastructure and reduce cloud costs. Specializing in AWS, Kubernetes, and DevOps automation. Currently taking consulting engagements.

Services
Cloud Infrastructure Consulting, DevOps Automation, CI/CD Pipeline Design

linkedin.com/in/hassansaulat
```
**Expected:** Score < 10, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### S5: Design agency
```
Sarah Mitchell
Creative Director at PixelForge Studio

About
PixelForge is a design and development agency. We build websites and apps for startups and enterprises. 15+ designers and developers. React, Next.js, Node.js.

Posts
"PixelForge is hiring! Looking for senior React developers to join our team."

linkedin.com/in/sarahmitchell
pixelforge.studio
```
**Expected:** Score < 10, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### S6: AI/ML consulting firm
```
Dr. Alex Chen
CEO, DeepMatrix AI

About
DeepMatrix AI helps enterprises implement machine learning solutions. We provide AI consulting, model development, and MLOps. Looking for partners, not clients.

Posts
"Excited to announce our new AI consulting practice. We help companies deploy ML at scale."

linkedin.com/in/alexchen
deepmatrix.ai
```
**Expected:** Score < 10, intent UNKNOWN, CONNECT WITHOUT NOTE

---

## 🔴 RECRUITERS (should score very low)

### R1: Technical recruiter at big tech
```
Jennifer Smith
Technical Recruiter at Google

About
Hiring engineers at Google. Currently recruiting for SRE and frontend roles. Connecting candidates with hiring teams.

Posts
"We're hiring! If you're a strong backend engineer, I'd love to connect you with our teams."

linkedin.com/in/jennifersmith
```
**Expected:** Score < 10, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### R2: Recruitment agency owner
```
Mike Johnson
Founder, TechTalent Recruiting

About
I help startups hire senior engineers. 10+ years in technical recruiting. Currently placing React, Node.js, and DevOps roles.

Posts
"Hot role: Senior React Engineer at Series B Fintech. $180k-$220k. DM me for details."

linkedin.com/in/mikejohnson
techtalent.io
```
**Expected:** Score < 10, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### R3: Internal recruiter hiring for own company
```
Lisa Park
Senior Recruiting Manager at Stripe

About
I lead recruiting for Stripe's engineering team. We're hiring senior backend, frontend, and infrastructure engineers.

Posts
"Stripe is hiring! Looking for exceptional engineers. Remote-friendly for some roles."

linkedin.com/in/lisapark
```
**Expected:** Score < 10, intent UNKNOWN, CONNECT WITHOUT NOTE

---

## 🔴 NON-TECHNICAL / IRRELEVANT

### N1: Marketing agency owner
```
Tom Williams
Founder, GrowthHack Marketing

About
We help SaaS companies scale their paid acquisition. Facebook ads, Google ads, SEO. $1M+ monthly ad spend managed.

Posts
"Just hit $500k MRR for our latest client. The power of performance marketing."

linkedin.com/in/tomwillieth
growthhack.io
```
**Expected:** Score < 10, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### N2: Student looking for job
```
Alex Johnson
Computer Science Student at MIT

About
CS student looking for internship opportunities. Learning React and Node.js. Built a few projects.

Posts
"Looking for summer 2025 internship. Open to remote opportunities."

linkedin.com/in/alexjohnson
```
**Expected:** Score < 10, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### N3: Non-technical small business
```
Mike Davis
Owner, Mike's Plumbing Services

About
Family-owned plumbing business serving Tulsa for 30 years. Looking for help with a website.

Posts
"Need someone to build a simple website for my plumbing business. Budget is $500."

linkedin.com/in/mikedavis
```
**Expected:** Score < 15, intent UNKNOWN, CONNECT WITHOUT NOTE

---

## 🟡 EDGE CASES (ambiguous — should be LOW-MEDIUM)

### E1: Founder posting technical content (no explicit need)
```
Daria Redkina
Founder at Solsonic

About
Building the future of audio technology. Passionate about signal processing and ML.

Posts
"Excited about the advances in real-time audio processing. The technology decisions you make today matter."
"Great conversation with fellow founders about the challenges of scaling hardware startups."
```
**Expected:** Score < 35, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### E2: Engineering leader sharing market observations
```
David Kim
Staff Engineer at Meta

About
Focused on distributed systems and infrastructure. Passionate about building at scale.

Posts
"The future of edge computing is exciting. Excited to see how WebAssembly changes deployment patterns."
"79,000 unfilled IT positions in Germany — the talent shortage is real."
```
**Expected:** Score < 20, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### E3: Founder hiring BUT with capacity signal
```
Priya Sharma
CEO at HealthTech Pro

About
We're hiring senior engineers. Our team is stretched thin and we need help delivering our Q2 roadmap. Can't keep up with demand.

Posts
"Hiring senior React and Node.js engineers. We're struggling to deliver on our roadmap with the current team."
```
**Expected:** Score 30-55, intent MEDIUM, CONNECT WITH NOTE (capacity signal detected)

---

### E4: CTO at startup, thin profile
```
Sam Taylor
CTO at NewStartup

About
Building something exciting in climate tech. Hiring engineers.

Posts
"NewStartup is hiring!"
```
**Expected:** Score < 25, intent UNKNOWN, CONNECT WITHOUT NOTE

---

### E5: Mixed signals — hiring + growth + funding
```
Maria Garcia
CEO at FinScale

About
Just closed our Series A. Team is growing fast. Hiring senior engineers and looking for development partners to accelerate our roadmap.

Posts
"FinScale raised $12M Series A. We're hiring AND looking for development partners to help us scale."
```
**Expected:** Score 40-65, intent MEDIUM/HIGH, CONNECT WITH NOTE

---

## 📊 Expected Distribution Summary

| Category | Count | Expected Score Range | Expected Action |
|----------|-------|---------------------|-----------------|
| Genuine buyers | 5 | 55-85 | CONNECT WITH NOTE |
| Hiring own team | 4 | < 50 | CONNECT WITHOUT NOTE |
| Service providers | 6 | < 15 | CONNECT WITHOUT NOTE |
| Recruiters | 3 | < 10 | CONNECT WITHOUT NOTE |
| Non-technical | 3 | < 15 | CONNECT WITHOUT NOTE |
| Edge cases | 5 | < 55 | MIXED |

---

## 🧪 Quick Verification Checklist

After deploying, test these assertions:

- [ ] No service provider scores > 20
- [ ] No recruiter scores > 15
- [ ] No "hiring only" profile scores > 55
- [ ] All genuine buyers score > 50
- [ ] No connection note generated for service providers
- [ ] No evidence entry contains "Opportunity Fit", "Remote Eligibility", etc.
- [ ] Michel Borges shows "service provider" in watchOut
- [ ] Nicholas Miller shows intent ≤ MEDIUM
- [ ] Sarah Chen still scores HIGH with explicit_ask signal
