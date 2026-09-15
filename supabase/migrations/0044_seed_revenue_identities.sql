-- 0044: Seed revenue identities

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000010','authenticated','authenticated','fizza@scout.dev',extensions.crypt('scout-dev-password',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()
where not exists (select 1 from auth.users au where au.email='fizza@scout.dev');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000011','authenticated','authenticated','zaira@scout.dev',extensions.crypt('scout-dev-password',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()
where not exists (select 1 from auth.users au where au.email='zaira@scout.dev');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000012','authenticated','authenticated','mehak@scout.dev',extensions.crypt('scout-dev-password',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()
where not exists (select 1 from auth.users au where au.email='mehak@scout.dev');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000013','authenticated','authenticated','aneeb@scout.dev',extensions.crypt('scout-dev-password',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()
where not exists (select 1 from auth.users au where au.email='aneeb@scout.dev');

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select 'aaaaaaaa-0000-0000-0000-000000000110', au.id, jsonb_build_object('sub',au.id::text,'email','fizza@scout.dev','email_verified',true), 'email', au.id::text, now(), now(), now()
from auth.users au where au.email='fizza@scout.dev' and not exists (select 1 from auth.identities ai where ai.user_id=au.id and ai.provider='email');

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select 'aaaaaaaa-0000-0000-0000-000000000111', au.id, jsonb_build_object('sub',au.id::text,'email','zaira@scout.dev','email_verified',true), 'email', au.id::text, now(), now(), now()
from auth.users au where au.email='zaira@scout.dev' and not exists (select 1 from auth.identities ai where ai.user_id=au.id and ai.provider='email');

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select 'aaaaaaaa-0000-0000-0000-000000000112', au.id, jsonb_build_object('sub',au.id::text,'email','mehak@scout.dev','email_verified',true), 'email', au.id::text, now(), now(), now()
from auth.users au where au.email='mehak@scout.dev' and not exists (select 1 from auth.identities ai where ai.user_id=au.id and ai.provider='email');

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select 'aaaaaaaa-0000-0000-0000-000000000113', au.id, jsonb_build_object('sub',au.id::text,'email','aneeb@scout.dev','email_verified',true), 'email', au.id::text, now(), now(), now()
from auth.users au where au.email='aneeb@scout.dev' and not exists (select 1 from auth.identities ai where ai.user_id=au.id and ai.provider='email');

insert into reps (id, name, role, auth_user_id) values
('bbbbbbbb-0000-0000-0000-000000000010', 'Fizza', 'rep', (select au.id from auth.users au where au.email='fizza@scout.dev')),
('bbbbbbbb-0000-0000-0000-000000000011', 'Zaira', 'rep', (select au.id from auth.users au where au.email='zaira@scout.dev')),
('bbbbbbbb-0000-0000-0000-000000000012', 'Mehak', 'rep', (select au.id from auth.users au where au.email='mehak@scout.dev'))
on conflict (reps.id) do nothing;

insert into profiles (id, rep_id, platform, label) values
('60000000-0000-0000-0000-000000000010', 'bbbbbbbb-0000-0000-0000-000000000010', 'upwork', 'Fizza Upwork'),
('60000000-0000-0000-0000-000000000011', 'bbbbbbbb-0000-0000-0000-000000000011', 'upwork', 'Zaira Upwork'),
('60000000-0000-0000-0000-000000000012', 'bbbbbbbb-0000-0000-0000-000000000012', 'upwork', 'Mehak Upwork')
on conflict (profiles.id) do nothing;

insert into profiles (id, rep_id, platform, label)
select '60000000-0000-0000-0000-000000000013', r2.id, 'upwork', 'Aneeb Upwork'
from reps r2 where r2.name = 'Aneeb' and not exists (select 1 from profiles p2 where p2.rep_id = r2.id and p2.platform = 'upwork')
on conflict (profiles.id) do nothing;

do $$
declare
  org_id uuid;
  admin_rep uuid;
  aneeb_rep_id uuid;
  v_fizza_prof uuid; v_zaira_prof uuid; v_mehak_prof uuid; v_aneeb_prof uuid; v_hassan_prof uuid;
begin
  select o2.id into org_id from organizations o2 limit 1;
  select ra.id into admin_rep from reps ra where ra.role = 'admin' limit 1;
  select r3.id into aneeb_rep_id from reps r3 where r3.name = 'Aneeb' limit 1;
  select p4.id into v_fizza_prof from profiles p4 where p4.id = '60000000-0000-0000-0000-000000000010';
  select p5.id into v_zaira_prof from profiles p5 where p5.id = '60000000-0000-0000-0000-000000000011';
  select p6.id into v_mehak_prof from profiles p6 where p6.id = '60000000-0000-0000-0000-000000000012';
  select p7.id into v_aneeb_prof from profiles p7 where p7.rep_id = aneeb_rep_id and p7.platform = 'upwork' limit 1;
  select p8.id into v_hassan_prof from profiles p8 join reps r8 on r8.id = p8.rep_id where r8.name = 'Hassan' and p8.platform = 'upwork';

  insert into revenue_identities (id, organization_id, slug, identity_name, title, positioning, skills, expertise, industries, technologies, allowed_first_person_claims, voice_tone, preferred_opportunity_types, proposal_positioning, profile_id) values
  ('a1000000-0000-0000-0000-000000000001', org_id, 'fizza', 'Fizza', 'Senior Full Stack Engineer', 'Full stack with React, Next.js, Firebase, Rails.', '["React","Next.js","Firebase","Rails","Node.js","Astro","TypeScript","GraphQL","AWS","Python"]'::jsonb, '["Full stack","Lead gen","E-commerce","Chrome extensions","DevOps"]'::jsonb, '["SaaS","E-commerce","FinTech","HealthTech"]'::jsonb, '["React","Next.js","Node.js","Firebase","Astro","Rails","Svelte","WXT","AWS","Python","Flask"]'::jsonb, '["Built full stack apps","Shipped for FinTech","Migrated no-code","Deployed bots"]'::jsonb, '{"formality":2,"tone":"professional"}'::jsonb, '["Full stack","Frontend","Firebase","DevOps"]'::jsonb, 'Full stack engineer.', v_fizza_prof)
  on conflict (revenue_identities.id) do nothing;
  insert into revenue_identities (id, organization_id, slug, identity_name, title, positioning, skills, expertise, industries, technologies, allowed_first_person_claims, voice_tone, preferred_opportunity_types, proposal_positioning, profile_id) values
  ('a1000000-0000-0000-0000-000000000002', org_id, 'zaira', 'Zaira', 'Full Stack & Cloud Engineer', 'Cloud, AI, HIPAA, blockchain.', '["Firebase","GCP","React","Node.js","Rails","AWS","Solana","Python","HIPAA","Web3"]'::jsonb, '["Cloud migration","AI platforms","HIPAA","Blockchain"]'::jsonb, '["HealthTech","Cloud","Blockchain","AI/ML"]'::jsonb, '["Firebase","GCP","AWS","React","Node.js","Rails","Next.js","Solana","Web3.js","Pinecone","Python","NestJS"]'::jsonb, '["Migrated GCP","Built AI compliance","Architected HIPAA","Built blockchain"]'::jsonb, '{"formality":2,"tone":"technical"}'::jsonb, '["Cloud","AI/ML","Healthcare","Blockchain"]'::jsonb, 'Cloud-savvy engineer.', v_zaira_prof)
  on conflict (revenue_identities.id) do nothing;
  insert into revenue_identities (id, organization_id, slug, identity_name, title, positioning, skills, expertise, industries, technologies, allowed_first_person_claims, voice_tone, preferred_opportunity_types, proposal_positioning, profile_id) values
  ('a1000000-0000-0000-0000-000000000003', org_id, 'mehak', 'Mehak', 'Senior Engineer & AI Specialist', 'AI/ML, cloud security, mobile, automation.', '["React","Next.js","Node.js","LangFlow","n8n","Zapier","Rails","AWS","Svelte","Python","OIDC"]'::jsonb, '["AI/ML","Cloud security","Mobile","Automation","Blockchain"]'::jsonb, '["Cloud Security","AI/ML","HealthTech","Blockchain"]'::jsonb, '["React","Next.js","Node.js","AWS Lambda","Rails","Svelte","TypeScript","LangFlow","n8n","Python","MongoDB"]'::jsonb, '["Built AI content","Led CSPM","Implemented PDR","Built RPA bots"]'::jsonb, '{"formality":2,"tone":"precise"}'::jsonb, '["AI/ML","Cloud security","Mobile"]'::jsonb, 'Engineer bridging dev and AI.', v_mehak_prof)
  on conflict (revenue_identities.id) do nothing;
  insert into revenue_identities (id, organization_id, slug, identity_name, title, positioning, skills, expertise, industries, technologies, allowed_first_person_claims, voice_tone, preferred_opportunity_types, proposal_positioning, profile_id) values
  ('a1000000-0000-0000-0000-000000000004', org_id, 'aneeb', 'Aneeb', 'CEO & Full Stack Architect', 'Founder building products to production.', '["React","Next.js","Firebase","Node.js","Svelte","Rails","TypeScript","LangFlow","Cloudflare","Stripe","Python","Web3"]'::jsonb, '["Architecture","Product","Firebase","AI agents","Marketplaces"]'::jsonb, '["SaaS","E-commerce","AI/ML","Web3","Marketplace"]'::jsonb, '["React","Next.js","Firebase","Node.js","Svelte","WXT","Rails 8","TypeScript","Cloudflare","Stripe","LangFlow","Python","Web3.js","NestJS"]'::jsonb, '["Built products","AI marketplaces","Browser extensions","Roadmaps","OIDC"]'::jsonb, '{"formality":2,"tone":"confident"}'::jsonb, '["Full stack","Architecture","AI/ML","Product"]'::jsonb, 'Founder-level engineer.', v_aneeb_prof)
  on conflict (revenue_identities.id) do nothing;
  insert into revenue_identities (id, organization_id, slug, identity_name, title, positioning, skills, expertise, industries, technologies, allowed_first_person_claims, voice_tone, preferred_opportunity_types, proposal_positioning, profile_id) values
  ('a1000000-0000-0000-0000-000000000005', org_id, 'hassan', 'Hassan', 'Senior DevOps & Full Stack', 'Cloud, compliance, production systems.', '["AWS","Terraform","CI/CD","Kubernetes","Docker","Linux","Next.js","React","Node.js","Rails","Svelte","Python","Flask"]'::jsonb, '["Cloud infrastructure","Compliance","Healthcare","Deployment"]'::jsonb, '["Cloud","HealthTech","FinTech","Compliance","DevOps"]'::jsonb, '["AWS","Terraform","Kubernetes","Docker","Linux","Next.js","React","Node.js","Rails","Svelte","WXT","Python","Flask","PostgreSQL"]'::jsonb, '["Hardened compliance","Infrastructure 211+ countries","Deployed bots","Blockchain"]'::jsonb, '{"formality":2,"tone":"thorough"}'::jsonb, '["DevOps","Compliance","Full stack"]'::jsonb, 'DevOps engineer.', v_hassan_prof)
  on conflict (revenue_identities.id) do nothing;

  insert into identity_assignments (organization_id, revenue_identity_id, rep_id, assigned_by) values
  (org_id, 'a1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000010', admin_rep),
  (org_id, 'a1000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000011', admin_rep),
  (org_id, 'a1000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000012', admin_rep),
  (org_id, 'a1000000-0000-0000-0000-000000000004', aneeb_rep_id, admin_rep),
  (org_id, 'a1000000-0000-0000-0000-000000000005', (select r9.id from reps r9 where r9.name='Hassan' limit 1), admin_rep)
  on conflict (identity_assignments.revenue_identity_id, identity_assignments.rep_id) do nothing;

  insert into activity_log (organization_id, event_type, actor_id, revenue_identity_id, metadata) values
  (org_id, 'identity_created', admin_rep, 'a1000000-0000-0000-0000-000000000001', '{"source":"import"}'),
  (org_id, 'identity_created', admin_rep, 'a1000000-0000-0000-0000-000000000002', '{"source":"import"}'),
  (org_id, 'identity_created', admin_rep, 'a1000000-0000-0000-0000-000000000003', '{"source":"import"}'),
  (org_id, 'identity_created', admin_rep, 'a1000000-0000-0000-0000-000000000004', '{"source":"import"}'),
  (org_id, 'identity_created', admin_rep, 'a1000000-0000-0000-0000-000000000005', '{"source":"import"}')
  on conflict do nothing;
end $$;