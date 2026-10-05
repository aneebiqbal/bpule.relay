/**
 * Live quality test — 15 diverse profiles.
 * Run with: node scripts/quality-test.cjs
 */
/* eslint-disable @typescript-eslint/no-require-imports */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  const { produceCanonicalIntelligence } = await import('../src/lib/intelligence-v2/orchestrator.ts');
  const { buildRevenueStrategy, sourceFromCanonical } = await import('../src/lib/relay/revenue-strategy.ts');
  const { generateDraft } = await import('../src/lib/ai/draft.ts');

  const profiles = [
    {
      name: 'Javier Livio Zavarce (remote barrier)',
      rawText: `Javier Livio Zavarce, PhD.\nFounder, President-CTO at Hacedor LLC\n\nAbout\nAs Founder, President, and CTO of Hacedor LLC, I lead the development of AI-driven tools that strengthen clinical assessment. I bring more than thirty years of applied engineering experience.\n\nExperience\nHacedor, LLC · Full-time · Jun 2023 - Present · Hybrid · Ohio, United States\nGooten · Senior Director Of Engineering · Aug 2021 - Jun 2023 · Remote\nARCHER Systems, LLC · Solutions Architect · Oct 2020 - Aug 2021 · Houston, Texas\nJ.P. Morgan · Senior Associate · Mar 2019 - Oct 2020 · Houston, Texas`,
      expectedAction: 'CONNECT_WITHOUT_NOTE',
    },
    {
      name: 'Michel Borges (fractional CTO)',
      rawText: `Michel Borges\nCEO, Cloud2Gether | Fractional CTO and Cloud Strategy Leader\n\nAbout\nI am a Fractional CTO and Cloud Strategy Leader with 15+ years designing cloud-native platforms, modernizing architecture, and scaling engineering teams. I partner with companies looking to accelerate cloud adoption or modernization. I help startups scale with confidence.`,
      expectedAction: 'CONNECT_WITHOUT_NOTE',
    },
    {
      name: 'Sarah Chen (genuine buyer)',
      rawText: `Sarah Chen\nVP Engineering at Flow Commerce\n\nAbout\nWe're rebuilding our checkout experience from scratch. Looking for a strong React/Node.js team who can work closely with our SF team. We've tried agencies before, need someone who can embed with our team. Remote OK.\n\nPosts\n"We've tried agencies before, need someone who can embed with our team."\nlinkedin.com/in/sarahchen`,
      expectedAction: 'CONNECT_WITH_NOTE',
    },
    {
      name: 'Adil Mahmood (dev agency)',
      rawText: `Adil Mahmood\nCo-founder & Director, Code Graphers\n\nAbout\nCo-founder & Director of CodeGraphers, I lead a team building scalable, secure software solutions for businesses that want to grow without technical debt. We work across AI integration, cloud architecture, and blockchain.\n\nServices\nMobile Application Development, Cloud Application Development, Custom Software Development, SaaS Development, Web Development\nlinkedin.com/in/adilmahmood`,
      expectedAction: 'CONNECT_WITHOUT_NOTE',
    },
    {
      name: 'Nicholas Miller (hiring own team)',
      rawText: `Nicholas Miller\nDirector of Engineering, Qualia\n\nAbout\nFocused on creating great software through solid architecture. Hiring: Senior Software Engineer I. Remote.\n\nPosts\n"Random weekend thoughts: The Ferrari Luce, the Swiss watch industry."`,
      expectedAction: 'CONNECT_WITHOUT_NOTE',
    },
    {
      name: 'Marcus Weber (explicit project ask)',
      rawText: `Marcus Weber\nCEO at Klar\n\nAbout\nKlar is the leading neobank for German-speaking Europe. Looking for external engineering help on our lending platform. Must be able to work in German timezones (CET). Remote possible.\n\nPosts\n"We need experienced teams who can help us rebuild our lending infrastructure. Contract/freelance OK."\nlinkedin.com/in/marcusweber`,
      expectedAction: 'CONNECT_WITH_NOTE',
    },
    {
      name: 'Jennifer Smith (recruiter)',
      rawText: `Jennifer Smith\nTechnical Recruiter at Google\n\nAbout\nHiring engineers at Google. Currently recruiting for SRE and frontend roles. Connecting candidates with hiring teams.\n\nPosts\n"We're hiring! If you're a strong backend engineer, I'd love to connect you with our teams."`,
      expectedAction: 'CONNECT_WITHOUT_NOTE',
    },
    {
      name: 'Alex Rivera (thin founder)',
      rawText: `Alex Rivera\nFounder at StartupX\n\nAbout\nBuilding something exciting in the fintech space.\n\nPosts\n"The future of finance is decentralized. Excited to see how blockchain transforms payments."`,
      expectedAction: 'CONNECT_WITHOUT_NOTE',
    },
    {
      name: 'Emily Torres (HIPAA project)',
      rawText: `Emily Torres\nHead of Product at Wellbeing Medical\n\nAbout\nWe need a team to help us build our next-gen patient portal. React, TypeScript, Node.js. Must understand HIPAA requirements. Remote-first company. We've tried agencies before.\n\nPosts\n"We need a team to help us build our next-gen patient portal."\nlinkedin.com/in/emilytorres`,
      expectedAction: 'CONNECT_WITH_NOTE',
    },
    {
      name: 'Chris Anderson (freelance dev offering)',
      rawText: `Chris Anderson\nSenior Fullstack Engineer | React • Node.js • TypeScript\n\nAbout\nI help startups build MVPs and scale their platforms. 8+ years experience. Currently available for freelance engagements. Remote worldwide.\n\nPosts\n"Just finished a React/Node.js project for a fintech startup. Available for new engagements."`,
      expectedAction: 'CONNECT_WITHOUT_NOTE',
    },
    {
      name: 'Dr. Alex Chen (AI consulting)',
      rawText: `Dr. Alex Chen\nCEO, DeepMatrix AI\n\nAbout\nDeepMatrix AI helps enterprises implement machine learning solutions. We provide AI consulting, model development, and MLOps. Looking for partners, not clients.\n\nPosts\n"Excited to announce our new AI consulting practice. We help companies deploy ML at scale."`,
      expectedAction: 'CONNECT_WITHOUT_NOTE',
    },
    {
      name: 'James Okonkwo (capacity crunch)',
      rawText: `James Okonkwo\nFounder & CEO at AfriPay\n\nAbout\nAfriPay is building payment infrastructure for Africa. We process payments across 15 countries. We can't keep up with our roadmap. Looking for a remote team to help build our mobile wallet product. Worldwide remote.\n\nPosts\n"Looking for a strong remote engineering team to help build our v2 mobile wallet. Worldwide remote."\nlinkedin.com/in/jamesokonkwo`,
      expectedAction: 'CONNECT_WITH_NOTE',
    },
    {
      name: 'David Kim (market commentary only)',
      rawText: `David Kim\nStaff Engineer at Meta\n\nAbout\nFocused on distributed systems and infrastructure. Passionate about building at scale.\n\nPosts\n"79,000 unfilled IT positions in Germany — the talent shortage is real."\n"Excited to speak at the DevOps conference next month."`,
      expectedAction: 'CONNECT_WITHOUT_NOTE',
    },
    {
      name: 'Maria Garcia (hiring + partners)',
      rawText: `Maria Garcia\nCEO at FinScale\n\nAbout\nJust closed our Series A. Team is growing fast. Hiring senior engineers and looking for development partners to accelerate our roadmap.\n\nPosts\n"FinScale raised $12M Series A. We're hiring AND looking for development partners to help us scale."`,
      expectedAction: 'CONNECT_WITH_NOTE',
    },
    {
      name: 'Priya Sharma (hiring + stretched)',
      rawText: `Priya Sharma\nCEO at HealthTech Pro\n\nAbout\nWe're hiring senior engineers. Our team is stretched thin and we need help delivering our Q2 roadmap. Can't keep up with demand.\n\nPosts\n"Hiring senior React and Node.js engineers. We're struggling to deliver on our roadmap."`,
      expectedAction: 'CONNECT_WITH_NOTE',
    },
  ];

  console.log('=== RELAY INTELLIGENCE QUALITY TEST ===\n');

  const results = [];

  for (const profile of profiles) {
    try {
      const intel = await produceCanonicalIntelligence(profile.rawText, {});
      const i = intel.intelligence;

      // Connection strategy
      const connSource = sourceFromCanonical(i, { channel: 'connection' });
      const connStrat = buildRevenueStrategy(connSource);

      // DM strategy
      const dmSource = sourceFromCanonical(i, { channel: 'dm' });
      const dmStrat = buildRevenueStrategy(dmSource);

      // Generate connection note if recommended
      let connectionNote = '';
      if (connStrat.contact.messageRecommended && connStrat.allowedNow.length > 0) {
        try {
          const note = await generateDraft({
            type: 'connection',
            lead: { id: 'test', company: i.company?.name || 'Unknown', contactName: i.person?.fullName || 'Unknown', contactTitle: i.person?.title || '', url: '' },
            extracted: { name: i.person?.fullName, title: i.person?.title, company: i.company?.name, url: '', signalType: 1, signalEvidence: '', verbatimQuote: '', tags: [], extractionConfidence: 80 },
            score: { total: i.canonicalScore, verdict: i.qualification, baseVerdict: i.qualification, breakdown: [], gates: [] },
            strategy: connStrat,
            conversationContext: null,
          });
          connectionNote = note?.text || '';
        } catch (e) {
          connectionNote = `[ERROR: ${e.message}]`;
        }
      }

      // Generate DM if recommended
      let dm = '';
      if (dmStrat.contact.messageRecommended && dmStrat.allowedNow.length > 0) {
        try {
          const dmDraft = await generateDraft({
            type: 'dm',
            lead: { id: 'test', company: i.company?.name || 'Unknown', contactName: i.person?.fullName || 'Unknown', contactTitle: i.person?.title || '', url: '' },
            extracted: { name: i.person?.fullName, title: i.person?.title, company: i.company?.name, url: '', signalType: 1, signalEvidence: '', verbatimQuote: '', tags: [], extractionConfidence: 80 },
            score: { total: i.canonicalScore, verdict: i.qualification, baseVerdict: i.qualification, breakdown: [], gates: [] },
            strategy: dmStrat,
            conversationContext: null,
          });
          dm = dmDraft?.text || '';
        } catch (e) {
          dm = `[ERROR: ${e.message}]`;
        }
      }

      const pass = (
        (profile.expectedAction === 'SKIP' && connStrat.contact.action === 'SKIP') ||
        (profile.expectedAction === 'CONNECT_WITHOUT_NOTE' && !connStrat.contact.messageRecommended) ||
        (profile.expectedAction === 'CONNECT_WITH_NOTE' && connStrat.contact.messageRecommended)
      );

      results.push({
        name: profile.name,
        score: i.canonicalScore,
        qualification: i.qualification,
        fit: connStrat.assessment.fit,
        intent: connStrat.assessment.intent,
        confidence: connStrat.assessment.confidence,
        action: connStrat.contact.action,
        messagingPolicy: connStrat.messagingPolicy,
        messageRecommended: connStrat.contact.messageRecommended,
        remoteEligibility: i.remoteEligibility?.eligibility,
        relationship: i.relationship,
        needOwnership: i.needOwnershipSummary?.dominant,
        connectionNote: connectionNote.slice(0, 300),
        dm: dm.slice(0, 300),
        expectedAction: profile.expectedAction,
        pass,
      });

      console.log(`\n${'='.repeat(70)}`);
      console.log(`PROFILE: ${profile.name}`);
      console.log(`  Score: ${i.canonicalScore}/100 (${i.qualification})`);
      console.log(`  Fit: ${connStrat.assessment.fit} | Intent: ${connStrat.assessment.intent} | Confidence: ${connStrat.assessment.confidence}`);
      console.log(`  Action: ${connStrat.contact.action} (${connStrat.messagingPolicy})`);
      console.log(`  Remote: ${i.remoteEligibility?.eligibility || 'N/A'}`);
      console.log(`  Relationship: ${i.relationship} | Need: ${i.needOwnershipSummary?.dominant || 'N/A'}`);
      if (connectionNote) console.log(`  Note: "${connectionNote}"`);
      if (dm) console.log(`  DM: "${dm}"`);
      console.log(`  Expected: ${profile.expectedAction} | ${pass ? '✓ PASS' : '✗ FAIL'}`);

    } catch (err) {
      console.error(`\nERROR: ${profile.name}: ${err.message}`);
      results.push({ name: profile.name, error: err.message, pass: false });
    }
  }

  console.log(`\n\n${'='.repeat(70)}`);
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass && !r.error).length;
  const errs = results.filter(r => r.error).length;
  console.log(`RESULTS: ${passed} pass / ${failed} fail / ${errs} errors (of ${results.length})`);

  fs.writeFileSync('audit-reports/historical-intelligence/quality-test-results.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
