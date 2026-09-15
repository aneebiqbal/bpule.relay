insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d1000000-0000-0000-0000-000000000001', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Unimog E-Commerce Logistics OLX', 'Senior Backend Engineer', 'Logistics for OLX Mall.', array['ruby-on-rails','nextjs','react'], array['Ruby on Rails','Next.js','React'], '2025-04-15')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d1000000-0000-0000-0000-000000000002', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Dubizzle Motors Migration', 'Senior Mobile Dev', 'NativeBase migration.', array['react-native','nativebase'], array['React Native','NativeBase'], '2025-04-15')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d1000000-0000-0000-0000-000000000003', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Fullscript Meditech', 'Senior Full Stack', 'Catalog modernization.', array['ruby-on-rails','graphql','cypress'], array['Ruby on Rails','GraphQL','Cypress'], '2025-04-12')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d1000000-0000-0000-0000-000000000004', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Boolerize Boolean Search', 'ML Engineer', 'Chrome extension.', array['svelte','typescript','wxt'], array['Svelte','TypeScript','WXT'], null)
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d1000000-0000-0000-0000-000000000005', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'sully.ai HealthTech', 'Senior Full Stack', 'Firebase to Mongoose.', array['react','nodejs','firebase'], array['React','Node.js','Firebase'], '2025-04-15')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d1000000-0000-0000-0000-000000000006', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000010'), 'Magaloop B2B Marketplace', 'Senior Full Stack', 'B2B marketplace.', array['ruby-on-rails','nextjs','nestjs'], array['Ruby on Rails','Next.js','NestJS'], '2025-04-15')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d2000000-0000-0000-0000-000000000001', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000011'), 'MinIO Object Storage', 'Storage Engineer', 'MinIO as S3.', array['minio','docker','kubernetes'], array['MinIO','Docker','Kubernetes'], '2026-04-15')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d2000000-0000-0000-0000-000000000002', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000011'), 'Fullscript Healthcare', 'Full Stack Engineer', 'Patient data.', array['ruby-on-rails','graphql','cypress'], array['Ruby on Rails','GraphQL','Cypress'], '2025-12-20')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d2000000-0000-0000-0000-000000000003', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000011'), 'Sully AI Healthcare', 'Full Stack Dev', 'HIPAA automation.', array['fhir','hipaa','nodejs'], array['FHIR','HIPAA','Node.js'], '2025-12-20')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d2000000-0000-0000-0000-000000000004', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000011'), 'MyUsta Marketplace', 'AI/ML Engineer', 'AI marketplace.', array['langchain','python'], array['LangChain','Python'], '2026-03-16')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d2000000-0000-0000-0000-000000000005', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000011'), 'OLX Unimog Logistics', 'Tech Lead', 'OLX logistics.', array['ruby-on-rails','postgresql'], array['Ruby on Rails','PostgreSQL'], '2025-12-25')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d2000000-0000-0000-0000-000000000006', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000011'), 'Zory AI Recommendation', 'Lead Backend', 'YOLO Pinecone.', array['pinecone','django'], array['Pinecone','Django'], '2025-12-20')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d2000000-0000-0000-0000-000000000007', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000011'), 'Noti.io Blockchain', 'Full Stack Dev', 'Blockchain monitoring.', array['web3','nestjs'], array['Web3','NestJS'], '2025-12-20')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d3000000-0000-0000-0000-000000000001', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'n8n Zapier Automation', 'Automation Spec', 'Identity verification.', array['n8n','zapier'], array['n8n','Zapier'], '2026-03-25')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d3000000-0000-0000-0000-000000000002', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'Fullscript Dispensary', 'Full Stack Engineer', 'Catalog overhaul.', array['nodejs','react','graphql'], array['Node.js','React','GraphQL'], null)
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d3000000-0000-0000-0000-000000000003', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'Aqua Security CSPM', 'CSPM Lead', 'Multi-cloud CSPM.', array['aws-lambda','kinesis'], array['AWS Lambda','Kinesis'], null)
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d3000000-0000-0000-0000-000000000004', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'OLX Logistics', 'Senior Backend', 'OLX logistics.', array['nodejs','aws-lambda'], array['Node.js','AWS Lambda'], null)
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d3000000-0000-0000-0000-000000000005', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'Dubizzle', 'Senior Full Stack', 'Motors NativeBase.', array['nextjs','react-native'], array['Next.js','React Native'], '2025-04-21')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d3000000-0000-0000-0000-000000000006', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'BlockSentry Blockchain', 'Senior Full Stack', 'Blockchain monitoring.', array['nextjs','nestjs','web3js'], array['Next.js','NestJS','Web3.js'], null)
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d3000000-0000-0000-0000-000000000007', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'MUA', 'Senior Software Eng', '3+ years full stack.', array['react','nodejs'], array['React','Node.js'], '2025-04-21')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d3000000-0000-0000-0000-000000000008', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'WeWash', 'Senior Software Eng', 'Website APIs.', array['vuejs','laravel'], array['Vue.js','Laravel'], '2025-04-21')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d3000000-0000-0000-0000-000000000009', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'Plena RPA Finance', 'Senior Software Eng', 'RPA finance.', array['nodejs','rpa'], array['Node.js','Python'], '2025-12-25')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d3000000-0000-0000-0000-000000000010', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000012'), 'LeaguesGG', 'Senior Full Stack', 'Gaming stats.', array['react','nodejs'], array['React','Node.js'], '2025-04-21')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d4000000-0000-0000-0000-000000000001', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'Sully AI HIPAA', 'Full Stack Dev', 'Firebase to Mongoose.', array['nodejs','react'], array['Node.js','React'], '2025-04-12')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d4000000-0000-0000-0000-000000000002', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'DeepIDV Identity', 'Senior SWE', 'Identity verification.', array['react','nextjs'], array['React','Next.js'], null)
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d4000000-0000-0000-0000-000000000003', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'OLX Logistics', 'Senior Backend', 'OLX logistics.', array['aws-lambda','mysql'], array['AWS Lambda','MySQL'], null)
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d4000000-0000-0000-0000-000000000004', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'Boolerize Rails', 'ML Engineer', 'Boolean extension.', array['rails','svelte'], array['Rails','Svelte'], null)
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d4000000-0000-0000-0000-000000000005', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'Web3 Trading', 'Full Stack Dev', 'Trading dashboard.', array['nextjs','nestjs'], array['Next.js','NestJS'], null)
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d4000000-0000-0000-0000-000000000006', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'myUsta Marketplace', 'AI/ML Engineer', 'AI marketplace.', array['langchain','python'], array['LangChain','Python'], '2026-03-16')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d4000000-0000-0000-0000-000000000007', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'Cloudflare Stripe', 'Full Stack Dev', 'DM, scheduler.', array['cloudflare','stripe'], array['Cloudflare','Stripe'], null)
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d4000000-0000-0000-0000-000000000008', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000013'), 'Dubizzle Motors', 'React Native Dev', 'Motors NativeBase.', array['react-native'], array['React Native'], '2025-04-19')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d5000000-0000-0000-0000-000000000001', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'Sully.ai Clinical', 'Senior DevOps', 'AI healthcare.', array['linux','terraform'], array['Linux','Terraform'], '2026-06-18')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d5000000-0000-0000-0000-000000000002', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'DeepIDV Platform', 'Senior Cloud', '211+ countries.', array['aws','terraform'], array['AWS','Terraform'], '2026-04-28')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d5000000-0000-0000-0000-000000000003', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'Fullscript CI/CD', 'Senior DevOps', 'Healthcare CI/CD.', array['cicd','docker'], array['CI/CD','Docker'], '2026-06-16')
on conflict (id) do nothing;

insert into portfolio_projects (id, organization_id, profile_id, project_title, my_role, description, skills, technologies, published_at) values
('d5000000-0000-0000-0000-000000000004', (select o.id from organizations o limit 1), (select p.id from profiles p where p.id = '60000000-0000-0000-0000-000000000014'), 'OLX Mall Cloud', 'Senior DevOps', 'OLX AWS.', array['aws','kubernetes'], array['AWS','Kubernetes'], '2026-06-18')
on conflict (id) do nothing;
