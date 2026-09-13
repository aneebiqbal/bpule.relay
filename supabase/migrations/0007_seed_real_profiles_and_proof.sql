-- 0007: Real reps, profiles, and proof items.
--
-- Transcribed directly from the uploaded client-review documents. Nothing is
-- invented. Hassan already exists (0004) and is intentionally not touched.
-- Aneeb already exists (rep bbbbbbbb-0000-0000-0000-000000000002 from 0004)
-- and is reused, not duplicated.
--
-- All permission_on_file values are false: no client has confirmed written
-- consent to be named externally yet. The client name is stored for when that
-- flag is flipped row by row, but the app will never surface it until then.

-- ============================================================================
-- Reps (Fizza, Mehak, Zaira). Aneeb already exists. auth_user_id is left null:
-- these reps have no auth account yet and cannot sign in until linked.
-- ============================================================================

insert into reps (id, name, role, auth_user_id)
select v.id, v.name, v.role, v.auth_user_id
from (values
  ('bbbbbbbb-0000-0000-0000-000000000005'::uuid, 'Fizza'::text, 'rep'::text, null::uuid),
  ('bbbbbbbb-0000-0000-0000-000000000006'::uuid, 'Mehak'::text, 'rep'::text, null::uuid),
  ('bbbbbbbb-0000-0000-0000-000000000007'::uuid, 'Zaira'::text, 'rep'::text, null::uuid)
) as v(id, name, role, auth_user_id)
where not exists (select 1 from reps r where r.name = v.name)
on conflict (id) do nothing;

-- ============================================================================
-- Profiles. profile_url, headline, and cv_path are intentionally null: none
-- were provided. label is also left null for the same reason.
-- ============================================================================

insert into profiles (id, rep_id, platform)
select v.id, r.id, v.platform
from (values
  ('60000000-0000-0000-0000-000000000001'::uuid, 'Fizza'::text, 'upwork'::text),
  ('60000000-0000-0000-0000-000000000002'::uuid, 'Fizza'::text, 'linkedin'::text),
  ('60000000-0000-0000-0000-000000000003'::uuid, 'Mehak'::text, 'upwork'::text),
  ('60000000-0000-0000-0000-000000000004'::uuid, 'Mehak'::text, 'linkedin'::text),
  ('60000000-0000-0000-0000-000000000005'::uuid, 'Zaira'::text, 'upwork'::text),
  ('60000000-0000-0000-0000-000000000006'::uuid, 'Aneeb'::text, 'upwork'::text),
  ('60000000-0000-0000-0000-000000000007'::uuid, 'Aneeb'::text, 'linkedin'::text)
) as v(id, name, platform)
join reps r on r.name = v.name
where not exists (
  select 1 from profiles p where p.rep_id = r.id and p.platform = v.platform
);

-- ============================================================================
-- Proof items. Each is attached to the rep's Upwork profile (the review
-- documents are Upwork client reviews). Mehak's and Aneeb's LinkedIn profiles
-- have no distinct project history in what was provided.
-- ============================================================================

insert into proof_items
  (id, profile_id, client_name, client_named, permission_on_file, project_summary, tags)
select v.id, p.id, v.client_name, false, false, v.summary, v.tags
from (values
  -- Mehak (Upwork)
  ('70000000-0000-0000-0000-000000000001'::uuid, 'Mehak'::text, 'upwork'::text, 'Oliver Grant'::text,
   'Integrated OIDC into an existing Next.js app, covering the auth flow, session management, and edge cases. Ran Nov 2025 to Feb 2026.'::text,
   array['nextjs','oauth','oidc','authentication']::text[]),
  ('70000000-0000-0000-0000-000000000002'::uuid, 'Mehak'::text, 'upwork'::text, 'Tariq Mehmood'::text,
   'Implemented PDR for indoor location tracking using sensor data, integrated into the app''s existing positioning system. Scoped and completed in three days.'::text,
   array['mobile','indoor-positioning','sensors','pdr']::text[]),
  ('70000000-0000-0000-0000-000000000003'::uuid, 'Mehak'::text, 'upwork'::text, 'Scott Hendricks'::text,
   'Agentic content system for a personal care brand, Langflow for orchestration, GitHub for version control, ChatGPT in the content pipeline. Ran May to Sept 2025, roughly 20 hrs/week.'::text,
   array['langflow','agentic','content-automation','marketing']::text[]),
  ('70000000-0000-0000-0000-000000000004'::uuid, 'Mehak'::text, 'upwork'::text, 'Andre Beaumont'::text,
   'Diagnosed and fixed a blank-screen bug on user search in a React/Vite app with a Node.js backend. Same-day fix, three-day project.'::text,
   array['react','vite','bugfix','nodejs']::text[]),
  ('70000000-0000-0000-0000-000000000005'::uuid, 'Mehak'::text, 'upwork'::text, 'Kevin Marsh'::text,
   'One-day paid trial on a Langflow/Node.js social content engine for a dental hygiene company. Improved the prototype and produced a full architecture map in plain language for non-technical stakeholders.'::text,
   array['langflow','nodejs','agentic','architecture-docs']::text[]),
  -- Zaira (Upwork)
  ('70000000-0000-0000-0000-000000000006'::uuid, 'Zaira'::text, 'upwork'::text, 'Marshel'::text,
   'Took a Lovable-built MVP covering GDPR, NIS2, DORA, and CSRD compliance workflows to production-ready, adding row level security, tenant isolation, and a clean admin panel.'::text,
   array['compliance','rls','tenant-isolation','admin-panel','gdpr']::text[]),
  ('70000000-0000-0000-0000-000000000007'::uuid, 'Zaira'::text, 'upwork'::text, 'Alexa'::text,
   'Conversational layer via the OpenAI API with a validation pipeline, plus a non-custodial blockchain settlement module. Stack: Node.js, NestJS, PostgreSQL, React, Next.js, AWS.'::text,
   array['blockchain','chat','nextjs','nestjs','openai','aws']::text[]),
  ('70000000-0000-0000-0000-000000000008'::uuid, 'Zaira'::text, 'upwork'::text, 'Zerish'::text,
   'Bilingual, role-based brand asset portal with CDN-backed storage and a headless CMS backend.'::text,
   array['dam','cms','cloudflare-r2','react','brand-portal']::text[]),
  ('70000000-0000-0000-0000-000000000009'::uuid, 'Zaira'::text, 'upwork'::text, 'Jose'::text,
   'Continued development on a WXT/Svelte/TypeScript browser extension with a Rails 8 API backend, new integrations and search logic improvements.'::text,
   array['browser-extension','svelte','rails','linkedin-tool']::text[]),
  ('70000000-0000-0000-0000-000000000010'::uuid, 'Zaira'::text, 'upwork'::text, 'Marchant'::text,
   'CSS work matching Figma specs and consolidation of a Base44 no-code build with a live production site. Two separate engagements with the same client.'::text,
   array['css','figma','react','nodejs','no-code-migration','base44']::text[]),
  ('70000000-0000-0000-0000-000000000011'::uuid, 'Zaira'::text, 'upwork'::text, 'Naji'::text,
   'Migrated a Python/Flask trading bot from Replit to Railway, Kalshi API with RSA-PSS auth, Discord webhook alerts, bug fixes included.'::text,
   array['python','flask','trading-bot','kalshi','deployment']::text[]),
  -- Aneeb (Upwork)
  ('70000000-0000-0000-0000-000000000012'::uuid, 'Aneeb'::text, 'upwork'::text, 'William Stacey'::text,
   'Lead-gen site with full technical SEO, a headless CMS, and tracked/spam-filtered lead capture forms.'::text,
   array['seo','headless-cms','lead-gen','marketing-site']::text[]),
  ('70000000-0000-0000-0000-000000000013'::uuid, 'Aneeb'::text, 'upwork'::text, 'Elliot Drummond'::text,
   'Discovery and architecture sprint covering frontend, backend, database, auth, API design, scaling, and a phased roadmap.'::text,
   array['architecture','discovery','owasp','database-design']::text[]),
  ('70000000-0000-0000-0000-000000000014'::uuid, 'Aneeb'::text, 'upwork'::text, 'Nasser Al-Fahad'::text,
   'Firebase auth, payments, a real-time Firestore order dashboard, and content moderation combining keyword and vision-based review.'::text,
   array['firebase','ecommerce','payments','auth','moderation']::text[]),
  ('70000000-0000-0000-0000-000000000015'::uuid, 'Aneeb'::text, 'upwork'::text, 'Liam Fogarty'::text,
   'Feature work on a WXT/Svelte/TypeScript extension with a Rails 8 API backend.'::text,
   array['browser-extension','svelte','rails']::text[]),
  ('70000000-0000-0000-0000-000000000016'::uuid, 'Aneeb'::text, 'upwork'::text, 'Stefan Richter'::text,
   'Rebuilt the auth layer implementing OpenID Connect, covering session management and token lifecycle. Ran about ten weeks.'::text,
   array['nextjs','oauth','oidc','authentication']::text[]),
  ('70000000-0000-0000-0000-000000000017'::uuid, 'Aneeb'::text, 'upwork'::text, 'Craig Donaghue'::text,
   'Multi-persona content generation system for a consumer brand, with trend research, image generation, and multi-format output.'::text,
   array['langflow','agentic','content-automation']::text[]),
  ('70000000-0000-0000-0000-000000000018'::uuid, 'Aneeb'::text, 'upwork'::text, 'Bilal Chaudhry'::text,
   'PDR module integrated into an existing positioning framework, delivered in three days.'::text,
   array['mobile','indoor-positioning','pdr']::text[])
 ) as v(id, rep_name, platform, client_name, summary, tags)
 join reps r on r.name = v.rep_name
 join profiles p on p.rep_id = r.id and p.platform = v.platform
 where not exists (select 1 from proof_items pi where pi.id = v.id)
 on conflict (id) do nothing;
