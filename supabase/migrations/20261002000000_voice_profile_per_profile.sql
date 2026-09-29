-- Voice profile per-profile support
--
-- Adds an optional profile_id column to voice_profiles so reps with multiple
-- revenue identities can have distinct calibrated voices per profile/persona.
-- Existing rows remain valid (profile_id is nullable) — they become the rep's
-- default voice, used when no profile-specific voice is set.

alter table voice_profiles
  add column if not exists profile_id uuid references profiles(id) on delete cascade;

-- Index for fast lookups by profile
create index if not exists voice_profiles_profile_idx on voice_profiles(profile_id);

-- A rep can have at most one voice profile per profile (or one default with null profile_id)
create unique index if not exists voice_profiles_rep_profile_unique
  on voice_profiles(rep_id, profile_id)
  where profile_id is not null;

create unique index if not exists voice_profiles_rep_default_unique
  on voice_profiles(rep_id)
  where profile_id is null;
