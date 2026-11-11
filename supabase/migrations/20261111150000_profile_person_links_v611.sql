-- RELAY V6.1.1 — Person-first knowledge requires every channel row of a person
-- to point at one canonical profile.
--
-- Most rows were linked when the person model landed. Aneeb's Upwork row was
-- not, so his Upwork sender scored 0 against the knowledge captured on his
-- LinkedIn profile and every match except the fully-populated row looked
-- broken (BUG-33).
--
-- §10 classification: only PROVABLY MERGEABLE rows are linked — an unlinked
-- row with no full name whose label's leading token appears in exactly ONE
-- canonical profile of a different platform. Orphan and ambiguous rows are
-- left untouched for review. This adds a link; it deletes nothing.
--
-- Verified before applying: exactly one row qualifies in production
--   profiles ebefd356-0db6-4273-b8dc-a26be14fcd06 ("Aneeb", upwork)
--     -> 87c10cd5-58e3-4742-910d-4de549d522c7 ("Muhammad Aneeb", linkedin)

update profiles child
set person_id = canonical.id,
    updated_at = now()
from profiles canonical
where child.organization_id = canonical.organization_id
  and child.person_id is null
  and child.full_name is null
  and child.label is not null
  and length(split_part(child.label, ' ', 1)) >= 3
  and canonical.person_id is null
  and canonical.id <> child.id
  and canonical.platform <> child.platform
  and canonical.full_name ilike '%' || split_part(child.label, ' ', 1) || '%'
  and (
    select count(*)
    from profiles other
    where other.organization_id = child.organization_id
      and other.person_id is null
      and other.id <> child.id
      and other.platform <> child.platform
      and other.full_name ilike '%' || split_part(child.label, ' ', 1) || '%'
  ) = 1;

-- Zaira's two rows stay unlinked: both are empty and neither is provably the
-- canonical person. Reported as MISSING SOURCE, not guessed.
