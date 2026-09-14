-- Migration 0037: Taste Profile persistence
--
-- Stores evolving taste preferences per persona. Compounds over time from
-- every interaction (write_this, not_for_me, posting, heavy_edit, etc.).
-- Loaded on studio open and fed into idea ranking alongside DNA + Memory.

CREATE TABLE IF NOT EXISTS content_taste_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES content_personas(id) ON DELETE UNIQUE,

  -- Dimensional preferences (-1 to 1)
  pref_technical_vs_human real NOT NULL DEFAULT 0,
  pref_opinion_vs_educational real NOT NULL DEFAULT 0,
  pref_timely_vs_evergreen real NOT NULL DEFAULT 0,
  pref_short_vs_deep real NOT NULL DEFAULT 0,
  pref_serious_vs_playful real NOT NULL DEFAULT 0,
  pref_personal_vs_universal real NOT NULL DEFAULT 0,

  -- Territory affinity (territory_name -> 0-1 weight)
  territory_affinity jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Confidence
  total_interactions integer NOT NULL DEFAULT 0,

  -- Short-term track (decays toward long-term)
  short_term jsonb NOT NULL DEFAULT '{}'::jsonb,
  short_term_weight real NOT NULL DEFAULT 0,

  -- Track what we've learned from
  last_signal_type text,
  last_signal_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One taste profile per persona
CREATE UNIQUE INDEX IF NOT EXISTS content_taste_profiles_persona_idx
  ON content_taste_profiles(persona_id);

-- RLS
ALTER TABLE content_taste_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_taste_profiles_owner_select"
  ON content_taste_profiles FOR SELECT
  USING (organization_id = current_org_id());

CREATE POLICY "content_taste_profiles_owner_insert"
  ON content_taste_profiles FOR INSERT
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "content_taste_profiles_owner_update"
  ON content_taste_profiles FOR UPDATE
  USING (organization_id = current_org_id())
  WITH CHECK (organization_id = current_org_id());

CREATE POLICY "content_taste_profiles_owner_delete"
  ON content_taste_profiles FOR DELETE
  USING (organization_id = current_org_id());
