-- Modern GoTrue requires an auth.identities row per user for email/password
-- sign-in to work. 0001 seeded auth.users directly; this adds the matching
-- identities. Delivered as a delta so the already-pushed hosted project is
-- patched without re-running 0001.

insert into auth.identities
  (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select
  'aaaaaaaa-0000-0000-0000-000000000101',
  id,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email',
  id::text,
  now(), now(), now()
from auth.users u
where u.email = 'hassan@scout.dev'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

insert into auth.identities
  (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select
  'aaaaaaaa-0000-0000-0000-000000000102',
  id,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email',
  id::text,
  now(), now(), now()
from auth.users u
where u.email = 'ahmed@scout.dev'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

insert into auth.identities
  (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select
  'aaaaaaaa-0000-0000-0000-000000000103',
  id,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email',
  id::text,
  now(), now(), now()
from auth.users u
where u.email = 'nadia@scout.dev'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );