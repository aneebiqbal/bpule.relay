-- 0010: Hassan's real proof items, and lock profiles/proof_items writes to admin.
--
-- Transcribed directly from Hassan_Client_Reviews.pdf. Nothing is invented.
-- Hassan's rep row already exists (0004); he has no profile row yet (0007
-- explicitly skipped him since his rep row already existed). All items are
-- attached to a single Upwork profile, matching the 0007 pattern of one
-- proof-bearing profile per rep for these review-derived items.
--
-- permission_on_file is false for every row: no client has confirmed written
-- consent to be named externally. The client name is stored for when that
-- flag is flipped row by row, but the app never surfaces it until then.

-- ============================================================================
-- Hassan's Upwork profile. profile_url, headline, and cv_path are left null:
-- none were provided.
-- ============================================================================

insert into profiles (id, rep_id, platform)
select '60000000-0000-0000-0000-000000000008'::uuid, r.id, 'upwork'
from reps r
where r.name = 'Hassan'
  and not exists (
    select 1 from profiles p where p.rep_id = r.id and p.platform = 'upwork'
  )
on conflict (id) do nothing;

-- ============================================================================
-- Proof items.
-- ============================================================================

insert into proof_items
  (id, profile_id, client_name, client_named, permission_on_file, project_summary, tags)
select v.id, p.id, v.client_name, false, false, v.summary, v.tags
from (values
  ('70000000-0000-0000-0000-000000000019'::uuid, 'James Whitmore'::text,
   'Hardened a live compliance platform (GDPR, NIS2, DORA, CSRD) for SMEs, restructuring the data layer with row level security, enforcing tenant isolation, closing auth gaps, and building an admin panel for full visibility and control.'::text,
   array['compliance','rls','tenant-isolation','admin-panel','gdpr','nis2','dora','csrd']::text[]),
  ('70000000-0000-0000-0000-000000000020'::uuid, 'Ryan Carter'::text,
   'Two-module platform, a conversational layer via the OpenAI API with a validation pipeline, and a non-custodial blockchain settlement module. Media encrypted AES-256-GCM, stored on AWS S3, verified via SHA-256.'::text,
   array['blockchain','chat','openai','aws','encryption']::text[]),
  ('70000000-0000-0000-0000-000000000021'::uuid, 'Marcus Webb'::text,
   'Bilingual, role-based brand asset portal, CDN-backed storage and delivery via Cloudflare R2, headless CMS backend, React/Next.js frontend.'::text,
   array['dam','cms','cloudflare-r2','react','nextjs','brand-portal','bilingual']::text[]),
  ('70000000-0000-0000-0000-000000000022'::uuid, 'Daniel Kowalski'::text,
   'Continued development on a WXT/Vite/Svelte/TypeScript extension with a Rails 8 API backend, new integrations, notification support, and reworked search logic.'::text,
   array['browser-extension','svelte','rails','linkedin-tool']::text[]),
  ('70000000-0000-0000-0000-000000000023'::uuid, 'Chris Harmon'::text,
   'Pre-launch pixel-precise CSS work against Figma designs and full consolidation of a Base44 no-code build with a live production site, shipped on time.'::text,
   array['css','figma','react','nodejs','no-code-migration','base44']::text[]),
  ('70000000-0000-0000-0000-000000000024'::uuid, 'Samuel Osei'::text,
   'Migrated a Python 3.11/Flask trading bot from Replit to Railway, Kalshi API with RSA-PSS auth, Discord webhook alerts, dual web/worker processes, with full deployment documentation.'::text,
   array['python','flask','trading-bot','kalshi','deployment']::text[]),
  ('70000000-0000-0000-0000-000000000025'::uuid, 'Nathan Brooks'::text,
   'Second engagement completing remaining Figma-matched CSS and functional gaps, ensuring both codebases operated as one system.'::text,
   array['css','figma','react','nodejs','no-code-migration','base44']::text[]),
  ('70000000-0000-0000-0000-000000000026'::uuid, 'David Okafor'::text,
   'Integrated Yotpo review widgets into individual product pages on a Rails/Avenue CMS store, following existing CMS conventions with no structural changes.'::text,
   array['rails','ecommerce','yotpo','avenue-cms']::text[])
) as v(id, client_name, summary, tags)
join reps r on r.name = 'Hassan'
join profiles p on p.rep_id = r.id and p.platform = 'upwork'
where not exists (select 1 from proof_items pi where pi.id = v.id);

-- ============================================================================
-- Lock profiles and proof_items writes to admin. This is shared, verifiable
-- business data (real client names, CVs, project history); it should be
-- edited deliberately by one person, not casually by whoever's logged in.
-- Select stays open to every authenticated rep (drafting needs to read
-- across all profiles for proof matching).
-- ============================================================================

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert
  to authenticated with check (rep_id = public.current_rep_id() or public.is_admin());

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_delete on profiles;
create policy profiles_delete on profiles for delete
  to authenticated using (public.is_admin());

drop policy if exists proof_items_insert on proof_items;
create policy proof_items_insert on proof_items for insert
  to authenticated with check (
    exists (
      select 1 from profiles p
      where p.id = profile_id
        and (p.rep_id = public.current_rep_id() or public.is_admin())
    )
    and public.is_admin()
  );

drop policy if exists proof_items_update on proof_items;
create policy proof_items_update on proof_items for update
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists proof_items_delete on proof_items;
create policy proof_items_delete on proof_items for delete
  to authenticated using (public.is_admin());

-- ============================================================================
-- Storage: CV insert/delete on proof-cvs was previously scoped to the
-- uploading rep's own folder only, with no admin escape hatch, so an admin
-- could not upload/replace/remove a CV on another rep's behalf from the new
-- Manage Profiles screen. storage.objects is owned by storage_admin and
-- cannot be altered from a migration (see scripts/ensure-storage.mjs); the
-- fix lives in supabase/storage-proof-cvs-policies.sql instead. Re-run that
-- file in the Supabase dashboard SQL editor (or via ensure-storage.mjs's
-- Management API path) after this migration.
-- ============================================================================
