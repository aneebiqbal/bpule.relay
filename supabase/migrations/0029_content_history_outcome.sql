-- 0029: let a past post be tagged with a real outcome (a DM, an inquiry, a
-- follow-up conversation) whenever it actually happens, days or weeks later.
-- Same honest metric used elsewhere in this project: a real inbound
-- conversation, never a follower count.

do $$ begin
  if to_regclass('public.content_history') is not null then
    alter table content_history add column if not exists led_to_real_outcome boolean not null default false;
    alter table content_history add column if not exists outcome_noted_at timestamptz;
  end if;
end $$;
