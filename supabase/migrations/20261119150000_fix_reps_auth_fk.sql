-- The app authenticates against neon_auth."user" (Better Auth in-app), but the
-- legacy reps FK still pointed at the old auth.users table. New signups could
-- not insert a rep. Point the FK at the table the auth engine actually writes.
alter table reps drop constraint if exists reps_auth_user_id_fkey;
alter table reps add constraint reps_auth_user_id_fkey
  foreign key (auth_user_id) references neon_auth."user"(id);
