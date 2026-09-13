-- 0026: Content engine v2.
--
-- Extends personas with a real personality layer and adds curated trending
-- angles. Angles are entered manually by the team and can be consumed once.

alter table content_personas
  add column if not exists humor_style text not null default '',
  add column if not exists values_and_opinions text[] not null default '{}',
  add column if not exists admired_examples text[] not null default '{}';

create table if not exists trending_angles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  pillar_id uuid not null references content_pillars(id) on delete cascade,
  angle_description text not null,
  source_note text not null default '',
  added_by uuid references reps(id) on delete set null,
  added_at timestamptz not null default now(),
  used boolean not null default false
);

create index if not exists trending_angles_org_idx on trending_angles (organization_id);
create index if not exists trending_angles_pillar_idx on trending_angles (pillar_id);
create index if not exists trending_angles_used_idx on trending_angles (used, added_at desc);

alter table trending_angles enable row level security;

create policy trending_angles_select on trending_angles for select
  to authenticated using (organization_id = current_org_id());

create policy trending_angles_insert on trending_angles for insert
  to authenticated with check (organization_id = current_org_id());

create policy trending_angles_update on trending_angles for update
  to authenticated using (organization_id = current_org_id())
  with check (organization_id = current_org_id());

create policy trending_angles_delete on trending_angles for delete
  to authenticated using (organization_id = current_org_id());
