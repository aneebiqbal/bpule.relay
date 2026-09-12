-- 0019: Fix content RLS policies — use auth_user_id like the rest of the app.
--
-- The reps table links to Supabase auth via auth_user_id, not id. The
-- content tables reference rep_id which is reps.id, so the policy needs
-- to join through reps where auth_user_id = auth.uid().

drop policy if exists "content_personas_owner" on content_personas;
create policy "content_personas_owner" on content_personas
  for all using (
    rep_id in (select id from reps where auth_user_id = auth.uid())
  );

drop policy if exists "content_pillars_persona_owner" on content_pillars;
create policy "content_pillars_persona_owner" on content_pillars
  for all using (
    persona_id in (select id from content_personas where rep_id in (select id from reps where auth_user_id = auth.uid()))
  );

drop policy if exists "content_drafts_persona_owner" on content_drafts;
create policy "content_drafts_persona_owner" on content_drafts
  for all using (
    persona_id in (select id from content_personas where rep_id in (select id from reps where auth_user_id = auth.uid()))
  );

drop policy if exists "content_history_persona_owner" on content_history;
create policy "content_history_persona_owner" on content_history
  for all using (
    persona_id in (select id from content_personas where rep_id in (select id from reps where auth_user_id = auth.uid()))
  );
