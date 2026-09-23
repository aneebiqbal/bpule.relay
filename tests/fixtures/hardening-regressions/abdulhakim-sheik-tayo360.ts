/**
 * Hardening regression fixture — Abdulhakim Sheik / Tayo360 (POSITIVE control).
 *
 * Unlike the Tammo/Saar/Avigail fixtures (which test that the pipeline stops
 * fabricating buyer signals), this fixture contains a REAL explicit
 * first-person hiring post: Abdulhakim personally posted "🚀 Hiring: Full
 * Stack Developer – Scheduling & Documentation Platform" for Tayo360,
 * listing React/Next.js/TypeScript/Node.js/NestJS/Express/PostgreSQL/AWS,
 * requesting resume/GitHub/portfolio/rate/availability, with explicit
 * apply-by-LinkedIn-or-email instructions. This must produce
 * opportunity=REAL, intent=HIGH, hiring signal=VERIFIED, and a real contact
 * action (not SKIP, not merely CONNECT_OR_OBSERVE-with-no-message).
 *
 * This fixture exists to prevent the attribution/relationship fixes
 * (subject-attribution, relationship-aware gating, remote-eligibility
 * NOT_APPLICABLE handling) from overcorrecting into suppressing genuine
 * first-person hiring signals. The critical distinction is "Tammo discusses
 * hiring (a recruiter describing his own audience/service)" vs "Abdulhakim
 * IS hiring (a prospect's own first-person hiring post with explicit apply
 * instructions, for his own company, seeking an individual contributor)."
 *
 * Note Abdulhakim's own headline/current role is "AI Automation & CRM
 * Workflow Specialist" / "AI Operations Strategist at tayo360" — he is
 * himself an automation/CRM/voice-AI practitioner, NOT primarily a full-stack
 * engineer. The hiring post is for a DIFFERENT role (full-stack SaaS
 * developer) than his own specialty — the pipeline must attribute the
 * hiring post's tech-stack requirements (React/Next.js/etc.) to the
 * OPPORTUNITY, not silently substitute or mirror Abdulhakim's own
 * CRM/automation skills as if they were the job requirement or as if he
 * were the one being pitched to for automation work.
 *
 * DO NOT tune Abdulhakim's numeric score to hit a specific number — this
 * fixture asserts QUALITATIVE invariants (intent stays HIGH/top-tier, hiring
 * signal stays verified, a real contact action survives), not a specific
 * score value.
 *
 * This is the real, unmodified raw LinkedIn source as supplied by the user.
 * DO NOT special-case "Abdulhakim", "Tayo360", or any wording from this
 * profile anywhere in application code — fixes must be general semantic
 * fixes (subject attribution, prospect-authored vs reposted/third-party
 * content, relationship classification), verified by running this fixture,
 * not fixes that pattern-match this text.
 */
export const ABDULHAKIM_SHEIK_TAYO360_RAW = `Abdulhakim Sheik
· 1st

AI Automation & CRM Workflow Specialist | Voice AI, Salesforce Marketing Cloud, HubSpot, n8n, Vapi

St Paul, Minnesota, United States

·

Contact info

tayo360


Western Governors University

https://github.com/ahakimsheik7

500+ connections



Fizza, Muhammad and 2 other mutual connections

Message

More
About
I build AI-powered workflow systems that help businesses respond faster, capture more leads, and reduce manual work.

My background combines 5+ years in email development, lifecycle marketing, and marketing automation with growing specialization in AI workflows, voice AI agents, and CRM-connected business systems.

I work across Salesforce Marketing Cloud, HubSpot, n8n, Vapi, HTML, CSS, SQL, AMPscript, and customer journey automation to create solutions that go beyond campaigns. I design systems that can answer calls, book appointments, create internal tasks, send leads into CRM, trigger email and SMS follow-up, and keep operations moving 24/7 without missed opportunities.

My experience includes building end-to-end projects across healthcare, airlines, online education, and automation-focused workflows. I enjoy bridging strategy and execution—turning business needs into practical systems that improve response time, customer experience, and team efficiency.

I'm especially interested in roles involving AI automation, voice AI, Salesforce Marketing Cloud, CRM workflows, lifecycle marketing, and business process automation. I'm open to remote, contract, and full-time opportunities where I can help teams build smarter, more scalable customer operations.

If you're hiring for AI-powered automation, lifecycle marketing, CRM workflow design, or Salesforce Marketing Cloud execution, let's connect.

Top skills

A/B Testing • AMPscript • Analytical Skills • Artificial Intelligence (AI) • B2B Marketing Strategy

Activity
1,047 followers


Posts

Comments

Images
View Abdulhakim Sheik's profile
Abdulhakim Sheik reposted this


View Matt Pacyga's profile
Matt Pacyga

  • Following

Senior Consultant @CGI | COO @Innovate MN | MBA

1mo •

Thank you to those who came out to AI Innovation for Business: Build Day. Thank you to our presenters and all those who came to build as a community.

Shout out to Innovate MN University of St. Thomas - Opus College of Business Applied AI for being excellent partners!

We'll be planning the next Build Day for 2027.

Be sure to check out Applied AI's conference Nov 2nd.

https://lnkd.in/gVwaHyhT

Abdulhakim Sheik and 43 others reacted

4 comments4 comments

•

2 reposts2 reposts


Like

Comment

Repost
Send
View Abdulhakim Sheik's profile
Abdulhakim Sheik

  • 1st

AI Automation & CRM Workflow Specialist | Voice AI, Salesforce Marketing Cloud, HubSpot, n8n, Vapi

1mo •


Honored to Present at the Applied AI Event 🚀

It was a great honor to attend and present at the Applied AI event at the University of St. Thomas – Minneapolis Campus.

After an 8-hour session filled with learning, conversations, and practical insights, one thing became even clearer: AI innovation is happening now. The question is no longer just what AI can do, but how we can take advantage of it to solve real problems, improve processes, and create meaningful solutions.

One of the highlights for me was having the opportunity to present a prototype application I've been building and demonstrate how AI can move from an idea into a practical, working solution.

I'm grateful for the opportunity to share my work, learn from others, connect with innovators, and continue growing as both a builder and AI strategist.

The future of AI isn't something we simply wait for — we have the opportunity to build it. 🚀

#AppliedAI #AIInnovation #ArtificialIntelligence #UniversityOfStThomas #Minneapolis #AIAgents #Innovation #Technology #Entrepreneurship #AIBuilder #FutureOfAI

11 reactions11


Like

Comment

Repost
Send
View Abdulhakim Sheik's profile
Abdulhakim Sheik

  • 1st

AI Automation & CRM Workflow Specialist | Voice AI, Salesforce Marketing Cloud, HubSpot, n8n, Vapi

3mo •


🚀 Hiring: Full Stack Developer – Scheduling & Documentation Platform
Tayo360 is looking for a talented Full Stack Developer to help build a modern workflow management platform focused on scheduling, documentation, reporting, and operational efficiency.
We're seeking someone who enjoys building scalable SaaS applications and can take ownership of features from concept to deployment.
Tech Stack:
• React
• Next.js
• TypeScript
• Tailwind CSS
• Node.js
• NestJS / Express
• PostgreSQL
• AWS
What You'll Work On:
• User Management
• Role-Based Permissions
• Scheduling Workflows
• Documentation Workflows
• Dashboard Reporting
• Notifications
• Workflow Automation
• Secure Data Management
What We're Looking For:
✅ Strong SaaS development experience
✅ Experience building production-ready applications
✅ Clean, maintainable code
✅ Strong communication skills
✅ Ability to work independently
✅ Startup mindset and execution-focused approach
Nice to Have:
• Workflow automation experience
• Cloud deployment experience
• API integrations
• Experience working in startup environments
To Apply:
Send:
• Resume or LinkedIn Profile
• GitHub Profile
• Portfolio or live projects
• Hourly or project rate
• Weekly availability
Selected candidates will complete a paid technical assessment.
📩 Apply by messaging me directly on LinkedIn or emailing:
asheik@tayo360.com
#Hiring #FullStackDeveloper #ReactJS #NextJS #NodeJS #TypeScript #PostgreSQL #SaaS #RemoteJobs #SoftwareDeveloper #StartupJobs #Tayo360

0

1 repost1 repost


Like

Comment

Repost
Send
View Abdulhakim Sheik's profile
Abdulhakim Sheik

  • 1st

AI Automation & CRM Workflow Specialist | Voice AI, Salesforce Marketing Cloud, HubSpot, n8n, Vapi

3mo •


🎉 Woohoo! Another milestone completed!
I've officially completed the "Take a Tour of the New Agentforce Builder" trail on Salesforce Trailhead 🚀
Exploring the new Agentforce Builder experience gave me deeper insight into:
• AI Agent architecture
• Agent orchestration
• Prompt-driven experiences
• Workflow automation
• Service and support innovation
• The future of conversational AI inside Salesforce
What excites me most is seeing how AI agents are evolving from simple chatbots into intelligent digital teammates capable of supporting businesses at scale.
As I continue my Agentforce journey, I'm focusing heavily on:
• Hands-on AI agent building
• Automation workflows
• Enterprise AI experiences
• Salesforce ecosystem solutions
• Real-world business use cases
The AI transformation is happening fast — and organizations that adopt intelligent automation early will have a major advantage.
More projects and innovations coming soon through Tayo360 🚀
#Salesforce #Agentforce #AI #ArtificialIntelligence #Automation #SalesforceTrailhead #DigitalTransformation #PromptEngineering #WorkflowAutomation #TechInnovation #CustomerExperience #AgenticAI


Take a Tour of the New Agentforce Builder | Salesforce Trailhead

trailhead.salesforce.com

1 reaction1


Like

Comment

Repost
Send
View Abdulhakim Sheik's profile
Abdulhakim Sheik

  • 1st

AI Automation & CRM Workflow Specialist | Voice AI, Salesforce Marketing Cloud, HubSpot, n8n, Vapi

3mo •


🚀 Excited to share that I've completed the "Quick Start: Assemble a Service Agent with Agentforce Builder" badge from Salesforce!
This hands-on experience strengthened my understanding of:
• AI-powered service automation
• Agentforce Builder workflows
• Service Agent configuration
• Conversational AI experiences
• Enterprise support automation
• Salesforce ecosystem innovation
As AI continues to transform how organizations interact with customers, learning to build intelligent service agents is becoming a critical skill for the future of customer experience and business automation.
I'm continuing to grow my expertise in:
• Salesforce Agentforce
• AI Agents & Automation
• Workflow Orchestration
• Prompt Engineering
• Salesforce Ecosystem Solutions
• Customer Experience Innovation
The future belongs to organizations that combine AI, automation, and human-centered experiences effectively.
Looking forward to building more real-world AI agent solutions through hands-on projects and innovation.
#Salesforce #Agentforce #ArtificialIntelligence #AI #Automation #CustomerExperience #SalesforceTrailhead #PromptEngineering #WorkflowAutomation #TechInnovation #AgenticAI #SalesforceDeveloper #DigitalTransformation


Creating a Service Agent with Agentforce Builder

trailhead.salesforce.com


Like

Comment

Repost
Send
View Abdulhakim Sheik's profile
Abdulhakim Sheik

  • 1st

AI Automation & CRM Workflow Specialist | Voice AI, Salesforce Marketing Cloud, HubSpot, n8n, Vapi

4mo •


I'm excited to share that I officially earned the Salesforce Agentblazer Innovator recognition for 2026 — a milestone that reflects hands-on building, testing, debugging, and real-world AI workflow development.
Over the past months, I've been deeply focused on building AI-powered business solutions using:
• Agentforce & AI Agents
• Prompt Engineering
• Workflow Automation
• AI Receptionists & Voice Agents
• Salesforce Ecosystem Integration
• Google Workspace Automations
• CRM & Data Flow Design
• Conversational AI Systems
• AI-powered Customer Support Experiences
• Business Process Optimization
• Debugging & System Troubleshooting
• GitHub + VS Code Development Workflow
What makes this journey valuable is not only learning concepts but building real working systems through continuous practice, testing, iteration, and debugging.
I've been developing AI agents designed to help organizations:
• Reduce repetitive manual tasks
• Improve customer response time
• Streamline scheduling and intake workflows
• Increase operational efficiency
• Improve client communication
• Automate internal processes
• Support scalable digital transformation initiatives
My focus moving into 2026 is continuing to build intelligent AI solutions that combine automation, usability, and business impact.
Excited for what's ahead in the world of AI, automation, and Agentforce innovation.
#Agentforce #Salesforce #AI #Automation #AIWorkflows #PromptEngineering #Agentblazer #SalesforceAI #DigitalTransformation #AIEngineer #WorkflowAutomation #CustomerExperience #BusinessAutomation #Tayo360


Be an Agentblazer: Gain AI Agentforce Skills on Trailhead

trailhead.salesforce.com

1 reaction1


Like

Comment

Repost
Send
View Abdulhakim Sheik's profile
Abdulhakim Sheik

  • 1st

AI Automation & CRM Workflow Specialist | Voice AI, Salesforce Marketing Cloud, HubSpot, n8n, Vapi

4mo • Edited •


Built and documented an enterprise AI agent architecture today using Salesforce Agentforce.
This system is designed to support real operational workflows — not just conversations.
The architecture focuses on:
• AI-powered service assistance
• Workflow automation
• Intelligent case handling
• AI grounding with enterprise data
• Multi-agent coordination
• Service planning logic
• Salesforce Flow automation
• Operational decision workflows
What excites me most is seeing how AI agents are evolving from simple assistants into operational systems that can support real business processes at scale.
The future of enterprise operations will likely involve:
AI + Workflow Automation + Human Oversight working together in one ecosystem.
Currently building and learning through:
Salesforce Agentforce
Enterprise AI Systems
Workflow Automation
Tayo360 AI Solutions
If you're a recruiter, Salesforce professional, founder, or business owner exploring AI agents and enterprise automation, let's connect.
🌐 Tayo360
📧 info@tayo360.com
#Salesforce #Agentforce #AI #EnterpriseAI #Automation #WorkflowAutomation #ArtificialIntelligence #SalesforceDeveloper #CRM #DigitalTransformation #Tech #Tayo360

1 reaction1

1 comment1 comment


Like

Comment

Repost
Send
View Abdulhakim Sheik's profile
Abdulhakim Sheik

  • 1st

AI Automation & CRM Workflow Specialist | Voice AI, Salesforce Marketing Cloud, HubSpot, n8n, Vapi

4mo •


I'm happy to share that I'm starting a new position as AI Operations Strategist at tayo360!

Starting a new position

7 reactions7

6 comments6 comments


Like

Comment

Repost
Send
View Abdulhakim Sheik's profile
Abdulhakim Sheik

  • 1st

AI Automation & CRM Workflow Specialist | Voice AI, Salesforce Marketing Cloud, HubSpot, n8n, Vapi

4mo •


📚 Big News!

I'm excited to share that my book, Understanding Boundaries: Learning Respect, Personal Space, and Safe Choices, is now officially part of the Ramsey County Library catalog!

It's available across all Ramsey County Library locations—making it easier for families, educators, and the community to access and use it.

This book is designed to support children's social and emotional development by teaching:
✔️ Respect
✔️ Personal boundaries
✔️ Safe decision-making

Seeing this work reach public libraries is a meaningful step toward making these important lessons more accessible to our community.

If you're in the Twin Cities area, feel free to check it out at your local branch!

Grateful for the support and excited for what's ahead.
— Abdulhakim Sheik
© 2026 Tayo360 • info@tayo360.com

4 reactions4

1 comment1 comment


Like

Comment

Repost
Send
View Abdulhakim Sheik's profile
Abdulhakim Sheik

  • 1st

AI Automation & CRM Workflow Specialist | Voice AI, Salesforce Marketing Cloud, HubSpot, n8n, Vapi

5mo •


I built a complete AI-style automation workflow using n8n — from data input to multi-channel notifications.

Here's how the system works step by step:

Step 1 — Input
Invoice data is captured (simulated as structured input)

Step 2 — Data Structuring
The system transforms invoice data into a structured JSON format

Step 3 — Data Storage
The processed data is automatically stored in Google Sheets for reporting

Step 4 — Email Notification
An automated email is sent when the invoice is processed

Step 5 — WhatsApp Notification
A real-time WhatsApp message is sent to notify the client

This simulates how real businesses automate operations across finance, logistics, and customer communication.

The goal is simple:
Replace manual workflows with automated systems.

Next step: integrating real AI for invoice extraction from documents.

#AI #Automation #n8n #WorkflowAutomation #BuildInPublic #DataEngineering

1 reaction1


Like

Comment

Repost
Send

Show all
Experience
AI Operations Strategist

tayo360 · Part-time

Mar 2026 - Present · 7 mos

United States · Remote

Email Marketing Specialist

Freelance · Freelance

Mar 2018 - Present · 8 yrs 7 mos

Greater Minneapolis-St. Paul Area · Remote

• Developed and executed targeted email marketing campaigns that significantly increased customer engagement.
• Managed Google Business profiles to enhance online visibility for various organizations.
• Analyzed campaign performance metrics, leading to a 30% increase in conversion rates.
• Collaborated with cross-functional teams to align marketing strategies with business objectives.

 Customer Journeys, Organization Skills and +26 skills

Email Marketing Specialist

New Century School  · Full-time

Mar 2021 - Sep 2023 · 2 yrs 7 mos

Greater Minneapolis-St. Paul Area · Remote

• Designed and implemented visually appealing email templates that significantly increased engagement metrics.
• Analyzed performance data to optimize campaigns, resulting in higher open and click-through rates.
• Collaborated with cross-functional teams to align email marketing strategies with overall business goals.

 Marketing Management, MailChimp and +9 skills

Web Manager/Email Marketing Specialist

Sufi Academy · Part-time

Sep 2018 - Aug 2023 · 5 yrs

United States

• Managed website and created 40+ email templates using HTML, CSS, and EPS for email marketing campaigns.
• Utilized MailChimp and HubSpot to optimize email marketing strategies for Sufi Academy.
• Increased email engagement by 25% through targeted email campaigns and personalized content.

 Leadership, Emerging Trends and +22 skills

Education
Western Governors University logo
Western Governors University

Bachelor of Science - BS, Computer Software Engineering

Dec 2023 – Dec 2026

 Market Segmentation, Audience Segmentation and +5 skills

City Colleges of Chicago-Harry S Truman College logo
City Colleges of Chicago-Harry S Truman College

GED

Aug 2015 – Aug 2019

Licenses & certifications (10)
LinkedIn logo
How to Speak Smarter When Put on the Spot

LinkedIn
`
