-- Fix content_personas RLS: allow insert if rep_id matches auth user and org is set
-- The issue is current_org_id() may not be available during onboarding

drop policy if exists content_personas_insert on content_personas;
create policy content_personas_insert on content_personas for insert
  to authenticated with check (
    rep_id = auth.uid()
    and organization_id is not null
  );

-- Also fix content_profiles RLS
drop policy if exists content_profiles_insert on content_profiles;
create policy content_profiles_insert on content_profiles for insert
  to authenticated with check (
    organization_id in (select organization_id from content_personas where id = content_profiles.persona_id)
  );

-- Fix daily_content_briefs RLS
drop policy if exists daily_content_briefs_insert on daily_content_briefs;
create policy daily_content_briefs_insert on daily_content_briefs for insert
  to authenticated with check (
    organization_id in (select organization_id from content_personas where id = daily_content_briefs.persona_id)
  );

-- Fix daily_content_ideas RLS
drop policy if exists daily_content_ideas_insert on daily_content_ideas;
create policy daily_content_ideas_insert on daily_content_ideas for insert
  to authenticated with check (
    organization_id in (select organization_id from content_personas where id = daily_content_ideas.persona_id)
  );
