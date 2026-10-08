-- Fix: content_personas RLS used auth.uid() instead of current_rep_id()
-- This caused "new row violates row-level security policy" on persona creation

DROP POLICY IF EXISTS "content_personas_owner" ON content_personas;
CREATE POLICY "content_personas_owner" ON content_personas
  FOR ALL USING (
    rep_id = current_rep_id()
    OR auth.uid() IN (SELECT id FROM reps WHERE role = 'admin')
  )
  WITH CHECK (
    rep_id = current_rep_id()
    OR auth.uid() IN (SELECT id FROM reps WHERE role = 'admin')
  );

-- Fix related tables that also use the wrong pattern
DROP POLICY IF EXISTS "content_pillars_owner" ON content_pillars;
CREATE POLICY "content_pillars_owner" ON content_pillars
  FOR ALL USING (
    persona_id IN (SELECT id FROM content_personas WHERE rep_id = current_rep_id())
    OR auth.uid() IN (SELECT id FROM reps WHERE role = 'admin')
  );

DROP POLICY IF EXISTS "content_profiles_owner" ON content_profiles;
CREATE POLICY "content_profiles_owner" ON content_profiles
  FOR ALL USING (
    persona_id IN (SELECT id FROM content_personas WHERE rep_id = current_rep_id())
    OR auth.uid() IN (SELECT id FROM reps WHERE role = 'admin')
  );

DROP POLICY IF EXISTS "content_taste_profiles_owner" ON content_taste_profiles;
CREATE POLICY "content_taste_profiles_owner" ON content_taste_profiles
  FOR ALL USING (
    persona_id IN (SELECT id FROM content_personas WHERE rep_id = current_rep_id())
    OR auth.uid() IN (SELECT id FROM reps WHERE role = 'admin')
  );

DROP POLICY IF EXISTS "content_journey_owner" ON content_journey;
CREATE POLICY "content_journey_owner" ON content_journey
  FOR ALL USING (
    persona_id IN (SELECT id FROM content_personas WHERE rep_id = current_rep_id())
    OR auth.uid() IN (SELECT id FROM reps WHERE role = 'admin')
  );

DROP POLICY IF EXISTS "content_memories_owner" ON content_memories;
CREATE POLICY "content_memories_owner" ON content_memories
  FOR ALL USING (
    persona_id IN (SELECT id FROM content_personas WHERE rep_id = current_rep_id())
    OR auth.uid() IN (SELECT id FROM reps WHERE role = 'admin')
  );

DROP POLICY IF EXISTS "content_quick_captures_owner" ON content_quick_captures;
CREATE POLICY "content_quick_captures_owner" ON content_quick_captures
  FOR ALL USING (
    persona_id IN (SELECT id FROM content_personas WHERE rep_id = current_rep_id())
    OR auth.uid() IN (SELECT id FROM reps WHERE role = 'admin')
  );

DROP POLICY IF EXISTS "content_opportunities_owner" ON content_opportunities;
CREATE POLICY "content_opportunities_owner" ON content_opportunities
  FOR ALL USING (
    persona_id IN (SELECT id FROM content_personas WHERE rep_id = current_rep_id())
    OR auth.uid() IN (SELECT id FROM reps WHERE role = 'admin')
  );

DROP POLICY IF EXISTS "topic_clusters_owner" ON topic_clusters;
CREATE POLICY "topic_clusters_owner" ON topic_clusters
  FOR ALL USING (
    persona_id IN (SELECT id FROM content_personas WHERE rep_id = current_rep_id())
    OR auth.uid() IN (SELECT id FROM reps WHERE role = 'admin')
  );
