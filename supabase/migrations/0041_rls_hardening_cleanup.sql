-- 0040: RLS hardening cleanup.
--
-- 0039's automated policy replacement loop assumed every persona-scoped
-- table's policies were named `<table>_select` / `_insert` / `_update` /
-- `_delete`. Three tables (content_journey, content_quick_captures,
-- content_taste_profiles) were created directly with an `_owner_` naming
-- convention (0037, 0038) instead, so `drop policy if exists <table>_select`
-- etc. silently matched nothing and left the old org-only policies active
-- alongside the new persona-owner-scoped ones. Since Postgres ORs multiple
-- permissive policies together, the old looser policy still granted access
-- — the persona-isolation fix from 0039 never actually took effect for
-- these three tables. This drops the leftover `_owner_*` policies so only
-- the new, correctly-scoped ones remain.

drop policy if exists "content_journey_owner_select" on content_journey;
drop policy if exists "content_journey_owner_insert" on content_journey;
drop policy if exists "content_journey_owner_update" on content_journey;
drop policy if exists "content_journey_owner_delete" on content_journey;

drop policy if exists "content_quick_captures_owner_select" on content_quick_captures;
drop policy if exists "content_quick_captures_owner_insert" on content_quick_captures;
drop policy if exists "content_quick_captures_owner_update" on content_quick_captures;
drop policy if exists "content_quick_captures_owner_delete" on content_quick_captures;

drop policy if exists "content_taste_profiles_owner_select" on content_taste_profiles;
drop policy if exists "content_taste_profiles_owner_insert" on content_taste_profiles;
drop policy if exists "content_taste_profiles_owner_update" on content_taste_profiles;
drop policy if exists "content_taste_profiles_owner_delete" on content_taste_profiles;

notify pgrst, 'reload schema';
