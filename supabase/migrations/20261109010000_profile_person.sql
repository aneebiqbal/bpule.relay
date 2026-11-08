-- RELAY V4 — One person, many channels.
--
-- A `profiles` row is a sender account. Today a person who sells on two
-- channels has two profiles, so the directory shows "Fizza Iqbal" twice and
-- the rep sees two unrelated cards.
--
-- `person_id` is a self-reference to the canonical profile for the human being.
-- Duplicate/orphan profiles point at it; nothing is deleted and no identity id
-- changes, so sender attribution, leads, messages, tasks, targets, coverage and
-- readiness history all keep their original rows.
--
-- Applied mapping (evidence: identical proof/project counts and the same
-- channel identity per group):
--   Fizza Iqbal   → fec8abf0 (LinkedIn)   ; 6e92e611 (Upwork), ce574fb9 (orphan)
--   Hassan Saulat → f67c1ba3 (LinkedIn)   ; cdbc68b6 (Upwork), bb33c611 (orphan)
--   Mehak Seedat  → fb589293 (LinkedIn)   ; 06e0a372 (Upwork)
--   Zaira         → 37ee6e21 (Upwork)     ; a316008b (orphan)
--   Aneeb         → 87c10cd5 (LinkedIn)   ; 61834d36 (orphan "Aneeb Iqbal")
--   Madiha Irfan  → ddc00fee (single)
--   testing       → left unmerged (provable test data)

alter table profiles add column if not exists person_id uuid references profiles(id) on delete set null;
create index if not exists profiles_person_idx on profiles (person_id);

update profiles set person_id = 'fec8abf0-7fb5-4999-87ea-fee805cc8c12'
  where id in ('6e92e611-dd09-464e-8b07-b82ef009e813', 'ce574fb9-5c13-4049-8476-ad900fb22d89');
update profiles set person_id = 'f67c1ba3-69bd-43a4-8410-7b35e0b79d44'
  where id in ('cdbc68b6-61e3-484e-8611-980682e2cc5b', 'bb33c611-d9c0-40a2-bd17-70fea83b2ac3');
update profiles set person_id = 'fb589293-16e9-42f8-806c-9ad4f4222ac9'
  where id in ('06e0a372-8e1c-456f-8a9c-4d052906cc36');
update profiles set person_id = '37ee6e21-17ec-4041-a5cc-1cfafe60ffd3'
  where id in ('a316008b-449d-4b56-aa18-0f56cb9e7492');
update profiles set person_id = '87c10cd5-58e3-4742-910d-4de549d522c7'
  where id in ('61834d36-42ce-42e4-8fc7-dd554a77beb7');
